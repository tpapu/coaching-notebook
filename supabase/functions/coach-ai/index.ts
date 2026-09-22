// Coaching Notebook — coach-ai Edge Function
//
// One HTTP endpoint, three actions selected by a `action` discriminator in the
// JSON body:
//
//   { action: 'chat', conversation_id, student_id, message }
//   { action: 'generate_plan', student_id }
//   { action: 'update_profile', student_id, mode?: 'incremental' | 'rebuild' }
//
// All actions gather context straight out of Postgres (using the service
// role key, server-side only) and call the Anthropic Messages API through the
// shared `callClaude` helpers. Secrets (ANTHROPIC_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY) live only in this function's environment — the
// frontend never sees them.
//
// Student memory: each student has a living README (students.profile_md).
// `update_profile` is the agent that keeps it current by folding new session
// logs into it. `chat` and `generate_plan` then read the README plus only the
// most recent / not-yet-summarized logs instead of the whole history.
//
// Deploy with:  supabase functions deploy coach-ai
// Secrets with: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//               supabase secrets set ALLOWED_ORIGINS=https://your-app.pages.dev,http://localhost:5173

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5-20250929'

// Origins allowed to call this function from a browser. Only the coach's own
// deployed frontend(s) should be able to — this is a single-user app, so
// there is no need for a wildcard. Defaults cover local dev; add your
// deployed URL(s) with:
//   supabase secrets set ALLOWED_ORIGINS=https://your-app.pages.dev,http://localhost:5173
const ALLOWED_ORIGINS = new Set(
  (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

/**
 * CORS headers for one request. Only echoes back Access-Control-Allow-Origin
 * when the request's Origin is on the allowlist — for any other origin we
 * omit it, which makes the browser refuse to hand the response to that
 * page's script even though the HTTP request itself still went through.
 */
function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

interface Student {
  id: string
  name: string
  skill_level: string | null
  notes: string | null
  profile_md: string | null
  profile_updated_at: string | null
  profile_logs_through: string | null
}

interface SessionLog {
  id: string
  session_date: string
  content: string
  tags: string[] | null
  created_at: string
}

// Session logs always included in chat / plan context (alongside the README),
// so the assistant has fine-grained recent detail the README may have compressed.
const RECENT_LOG_COUNT = 5

const SESSION_LOG_COLUMNS = 'id, session_date, content, tags, created_at'

interface ChatMessageRow {
  role: 'user' | 'assistant'
  content: string
}

interface CoachingInsight {
  skill_tag: string
  problem: string
  fix: string
}

interface SuggestedInsight {
  skill_tag: string
  problem: string
  fix: string
}

// ---------------------------------------------------------------------------
// Shared Claude caller
// ---------------------------------------------------------------------------

interface ClaudeParams {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens?: number
}

/**
 * Calls the Anthropic Messages API with a system prompt + conversation
 * turns. Every action goes through this one place, so there is exactly one
 * function that knows how to talk to Claude. Also reports `stopReason` so
 * callers that must not save truncated output (the README agent) can check it.
 */
async function callClaudeDetailed(
  params: ClaudeParams,
): Promise<{ text: string; stopReason: string | null }> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the coach-ai function')
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: params.maxTokens ?? 1500,
      system: params.system,
      messages: params.messages,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${text}`)
  }

  const data = await res.json()
  const textBlocks = (data.content ?? [])
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
  return { text: textBlocks.join('\n').trim(), stopReason: data.stop_reason ?? null }
}

async function callClaude(params: ClaudeParams): Promise<string> {
  return (await callClaudeDetailed(params)).text
}

// ---------------------------------------------------------------------------
// Suggested-insight extraction
// ---------------------------------------------------------------------------
//
// Design choice: rather than running a second "classification" call after
// every chat turn (extra latency + cost for something that only fires
// occasionally), we ask Claude to optionally emit one structured tag at the
// end of its normal reply, e.g.:
//
//   <suggested_insight>{"skill_tag":"serve","problem":"...","fix":"..."}</suggested_insight>
//
// We strip that tag out of the text shown to the user and parse it into
// `suggested_insight` on the response. The frontend then shows a "Save this
// as a coaching insight?" confirm/dismiss prompt — nothing is written to
// coaching_insights without the coach explicitly confirming it.
const INSIGHT_TAG_RE = /<suggested_insight>([\s\S]*?)<\/suggested_insight>/i

function extractSuggestedInsight(rawText: string): {
  cleanText: string
  suggestedInsight: SuggestedInsight | null
} {
  const match = rawText.match(INSIGHT_TAG_RE)
  if (!match) {
    return { cleanText: rawText.trim(), suggestedInsight: null }
  }

  const cleanText = rawText.replace(INSIGHT_TAG_RE, '').trim()

  try {
    const parsed = JSON.parse(match[1].trim())
    if (
      parsed &&
      typeof parsed.skill_tag === 'string' &&
      typeof parsed.problem === 'string' &&
      typeof parsed.fix === 'string'
    ) {
      return { cleanText, suggestedInsight: parsed }
    }
  } catch {
    // Malformed tag — ignore it and just show the cleaned text.
  }

  return { cleanText, suggestedInsight: null }
}

const INSIGHT_INSTRUCTIONS = `
If, and only if, something in this conversation reveals a coaching pattern
that would generalize usefully to OTHER students (a common technical problem
and a fix that worked), append exactly one tag after your reply, on its own
line, in this exact format:

<suggested_insight>{"skill_tag": "...", "problem": "...", "fix": "..."}</suggested_insight>

Keep skill_tag short (e.g. "serve toss", "backhand footwork"). Do this rarely
— only for genuinely reusable insights, not routine notes. Omit the tag
entirely most of the time.`.trim()

// ---------------------------------------------------------------------------
// Context builders
// ---------------------------------------------------------------------------

async function loadStudent(supabase: SupabaseClient, studentId: string): Promise<Student> {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, skill_level, notes, profile_md, profile_updated_at, profile_logs_through')
    .eq('id', studentId)
    .single()
  if (error || !data) throw new Error(`Could not load student ${studentId}: ${error?.message}`)
  return data
}

async function loadAllSessionLogs(supabase: SupabaseClient, studentId: string): Promise<SessionLog[]> {
  const { data, error } = await supabase
    .from('session_logs')
    .select(SESSION_LOG_COLUMNS)
    .eq('student_id', studentId)
    .order('session_date', { ascending: true })
  if (error) throw new Error(`Could not load session logs: ${error.message}`)
  return data ?? []
}

/** Logs created after `since` (all logs if `since` is null), oldest to newest. */
async function loadLogsCreatedSince(
  supabase: SupabaseClient,
  studentId: string,
  since: string | null,
): Promise<SessionLog[]> {
  let query = supabase.from('session_logs').select(SESSION_LOG_COLUMNS).eq('student_id', studentId)
  if (since) query = query.gt('created_at', since)
  const { data, error } = await query.order('session_date', { ascending: true })
  if (error) throw new Error(`Could not load new session logs: ${error.message}`)
  return data ?? []
}

/**
 * Logs to put in a chat / plan prompt.
 *
 * With a README: the README carries the long-term picture, so we send only
 * the most recent logs plus any logs not yet folded into it (so a stale
 * README never hides a lesson). Without a README (new student, or one who
 * predates this feature) we fall back to the full history.
 */
async function loadContextLogs(supabase: SupabaseClient, student: Student): Promise<SessionLog[]> {
  if (!student.profile_md?.trim()) return loadAllSessionLogs(supabase, student.id)

  const [recentResult, unsynced] = await Promise.all([
    supabase
      .from('session_logs')
      .select(SESSION_LOG_COLUMNS)
      .eq('student_id', student.id)
      .order('session_date', { ascending: false })
      .limit(RECENT_LOG_COUNT),
    loadLogsCreatedSince(supabase, student.id, student.profile_logs_through),
  ])
  if (recentResult.error) throw new Error(`Could not load recent session logs: ${recentResult.error.message}`)

  const byId = new Map<string, SessionLog>()
  for (const log of [...(recentResult.data ?? []), ...unsynced]) byId.set(log.id, log)
  return [...byId.values()].sort(
    (a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime(),
  )
}

async function loadRecentChatMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit = 20,
): Promise<ChatMessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`Could not load chat messages: ${error.message}`)
  return (data ?? [])
    .reverse()
    .map((row: ChatMessageRow) => ({ role: row.role, content: row.content }))
}

async function loadAllInsights(supabase: SupabaseClient): Promise<CoachingInsight[]> {
  // Also fully stuffed rather than tag-filtered — see LessonPlanPane / README
  // for why (data volume is small; filtering adds complexity for little
  // benefit at single-coach scale).
  const { data, error } = await supabase
    .from('coaching_insights')
    .select('skill_tag, problem, fix')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Could not load coaching insights: ${error.message}`)
  return data ?? []
}

function formatLogLines(logs: SessionLog[]): string {
  return logs.length
    ? logs
        .map((log) => {
          // session_date is stored as UTC noon for the calendar day the
          // coach picked (see src/lib/date.ts on the frontend), so slicing
          // the UTC ISO string gives the correct calendar day regardless of
          // server timezone. Keep this UTC-based — do NOT switch to a
          // locale/local-timezone formatter, or this will disagree with what
          // the coach sees in the UI (LogEntryItem also formats in UTC).
          const date = new Date(log.session_date).toISOString().slice(0, 10)
          const tags = log.tags && log.tags.length ? ` [tags: ${log.tags.join(', ')}]` : ''
          return `- ${date}${tags}: ${log.content}`
        })
        .join('\n')
    : '(no session logs yet)'
}

function formatStudentContext(student: Student, logs: SessionLog[]): string {
  const header = `Student: ${student.name}
Skill level: ${student.skill_level ?? 'unspecified'}
Standing notes: ${student.notes ?? '(none)'}`

  const readme = student.profile_md?.trim()
  if (!readme) {
    return `${header}

Session log history (oldest to newest):
${formatLogLines(logs)}`
  }

  return `${header}

Student README (a living profile kept up to date from all past sessions — treat it as the coach's trusted summary of this student):
${readme}

Most recent session logs, plus any not yet reflected in the README (oldest to newest):
${formatLogLines(logs)}

Older individual session logs are not shown; the README is the only record of them. If asked about a specific older session the README doesn't cover, say so rather than guessing.`
}

function formatInsightsContext(insights: CoachingInsight[]): string {
  if (!insights.length) return '(no saved coaching insights yet)'
  return insights.map((i) => `- [${i.skill_tag}] Problem: ${i.problem} -> Fix: ${i.fix}`).join('\n')
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleChat(
  supabase: SupabaseClient,
  body: { conversation_id: string; student_id: string; message: string },
) {
  const { conversation_id, student_id, message } = body
  if (
    typeof conversation_id !== 'string' ||
    !conversation_id ||
    typeof student_id !== 'string' ||
    !student_id ||
    typeof message !== 'string' ||
    !message.trim()
  ) {
    throw new HttpError(400, 'conversation_id, student_id and message are required')
  }

  const [student, history] = await Promise.all([
    loadStudent(supabase, student_id),
    loadRecentChatMessages(supabase, conversation_id, 20),
  ])
  const logs = await loadContextLogs(supabase, student)

  const system = `You are an experienced tennis coach's private assistant, helping the human coach think through a specific student. Be concrete, reference the student's actual session history when relevant, and keep replies focused and practical (coach-to-coach tone, not generic advice).

${formatStudentContext(student, logs)}

${INSIGHT_INSTRUCTIONS}`

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: message },
  ]

  const rawReply = await callClaude({ system, messages })
  const { cleanText, suggestedInsight } = extractSuggestedInsight(rawReply)

  // Persist both turns of this exchange.
  const { error: insertError } = await supabase.from('chat_messages').insert([
    { conversation_id, role: 'user', content: message },
    { conversation_id, role: 'assistant', content: cleanText },
  ])
  if (insertError) throw new Error(`Could not save chat messages: ${insertError.message}`)

  return {
    reply: cleanText,
    suggested_insight: suggestedInsight,
  }
}

async function handleGeneratePlan(supabase: SupabaseClient, body: { student_id: string }) {
  const { student_id } = body
  if (!student_id) throw new HttpError(400, 'student_id is required')

  const [student, insights] = await Promise.all([
    loadStudent(supabase, student_id),
    loadAllInsights(supabase),
  ])
  const logs = await loadContextLogs(supabase, student)

  const system = `You are an experienced tennis coach's private assistant. Write a single lesson plan for the upcoming session with this student, grounded in their session history and drawing on the coach's broader library of coaching insights where relevant. Structure it with clear sections (warm-up, focus areas, drills, cool-down/notes). Be specific and actionable, not generic.

${formatStudentContext(student, logs)}

Coach's saved coaching insights (from all students, may or may not be relevant to this student):
${formatInsightsContext(insights)}`

  const plan = await callClaude({
    system,
    messages: [
      {
        role: 'user',
        content: 'Generate the lesson plan for this student\'s next session.',
      },
    ],
    maxTokens: 2000,
  })

  // Intentionally NOT saved here — the frontend shows the plan with an
  // explicit "Save" button that writes to lesson_plans.
  return { plan }
}

// ---------------------------------------------------------------------------
// README agent
// ---------------------------------------------------------------------------

const PROFILE_MAX_TOKENS = 2500
// Two attempts: if a write lands while the model is thinking (a hand edit in
// the UI, or a second update), the retry re-reads and redoes the update on top
// of that newer README instead of overwriting it.
const PROFILE_MAX_ATTEMPTS = 2

const PROFILE_SYSTEM_PROMPT = `You maintain the private "student README" for a tennis coach: a compact, living profile of ONE student. The coach's AI assistant reads this README before every conversation instead of re-reading the whole session history, so its quality directly decides how useful that assistant is. Write it like a sharp coach's handoff note.

You will be given the current README (possibly empty), the student's basic info, and session log entries that are NOT yet reflected in the README. Reply with the complete updated README.

Rules:
- Update incrementally. Keep everything that is still true, revise what the new sessions changed, and add what they revealed. Do not rewrite from scratch and do not drop details just because they are old — only when they are resolved or contradicted.
- The coach may have hand-edited the current README. Preserve their additions, wording and corrections unless the new logs directly contradict them.
- Only state what the logs or student info support. Never invent drills, injuries, goals, results or personality traits. If something is uncertain, mark it "(unconfirmed)" or leave it out.
- Be specific and concrete: name the stroke, the cue, the drill, what worked and what didn't. Skip generic praise.
- Track direction of change: what is improving, what regressed, what is stuck.
- Keep the whole README under about 700 words. As it grows, compress: merge repeated observations, shrink older timeline entries to one line, and fold resolved problems into a short "Resolved" line under Recurring issues.
- Output ONLY the README markdown. No preamble, no explanation, no code fences.

Use exactly this structure and keep every heading even when a section is empty (write "None yet."):

# <student name>
## Snapshot
Level, type of player / age group, goals, schedule and availability, physical notes or injuries, learning style and personality.
## Strengths
## Working on now
## Recurring issues
Each as: the problem — what has been tried — what worked or didn't.
## What works for this student
Cues, drills, feedback style and pacing that land well.
## Progress timeline
Dated one-liners (YYYY-MM-DD), oldest first. Compress older entries.
## Next lesson ideas
Open threads, and what to check or build on next time.`

function buildProfileUpdateRequest(
  student: Student,
  currentReadme: string | null,
  logs: SessionLog[],
): string {
  return `Student: ${student.name}
Skill level: ${student.skill_level ?? 'unspecified'}
Standing notes (written by the coach): ${student.notes ?? '(none)'}

<current_readme>
${currentReadme?.trim() || '(empty — this is the first version)'}
</current_readme>

<new_session_logs>
${formatLogLines(logs)}
</new_session_logs>

Write the updated README.`
}

function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/i)
  return (match ? match[1] : text).trim()
}

/**
 * Folds session logs into a student's README.
 *
 *   incremental (default): only logs newer than the README's watermark
 *                          (profile_logs_through), applied on top of the
 *                          current README.
 *   rebuild:               regenerate from every log, ignoring the current
 *                          README (the old one is archived by a DB trigger).
 *
 * A student with no README always gets a from-scratch build.
 */
async function handleUpdateProfile(
  supabase: SupabaseClient,
  body: { student_id: string; mode?: string },
) {
  const { student_id, mode } = body
  if (typeof student_id !== 'string' || !student_id) {
    throw new HttpError(400, 'student_id is required')
  }
  if (mode !== undefined && mode !== 'incremental' && mode !== 'rebuild') {
    throw new HttpError(400, "mode must be 'incremental' or 'rebuild'")
  }

  for (let attempt = 1; attempt <= PROFILE_MAX_ATTEMPTS; attempt++) {
    const student = await loadStudent(supabase, student_id)
    const fromScratch = mode === 'rebuild' || !student.profile_md?.trim()

    const logs = fromScratch
      ? await loadAllSessionLogs(supabase, student_id)
      : await loadLogsCreatedSince(supabase, student_id, student.profile_logs_through)
    if (logs.length === 0) {
      return { status: fromScratch ? 'no_logs' : 'up_to_date', logs_incorporated: 0 }
    }

    const { text, stopReason } = await callClaudeDetailed({
      system: PROFILE_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: buildProfileUpdateRequest(student, fromScratch ? null : student.profile_md, logs),
        },
      ],
      maxTokens: PROFILE_MAX_TOKENS,
    })
    if (stopReason === 'max_tokens') {
      throw new Error('The README update was cut off before it finished, so nothing was saved. Try again.')
    }
    const readme = stripCodeFence(text)
    if (readme.length < 80 || !readme.startsWith('#')) {
      throw new Error('The README agent returned an unexpected response, so nothing was saved. Try again.')
    }

    const newestCreatedAt = logs.reduce(
      (newest, log) => (Date.parse(log.created_at) >= Date.parse(newest) ? log.created_at : newest),
      logs[0].created_at,
    )

    // Compare-and-swap on profile_updated_at: only write if nobody changed the
    // README since we read it. The watermark moves in the same statement, so
    // "README text" and "logs it covers" can never disagree.
    let update = supabase
      .from('students')
      .update({ profile_md: readme, profile_logs_through: newestCreatedAt })
      .eq('id', student.id)
    update =
      student.profile_updated_at === null
        ? update.is('profile_updated_at', null)
        : update.eq('profile_updated_at', student.profile_updated_at)
    const { data, error } = await update.select('id')
    if (error) throw new Error(`Could not save README: ${error.message}`)
    if (data && data.length > 0) return { status: 'updated', logs_incorporated: logs.length }
  }

  return { status: 'conflict', logs_incorporated: 0 }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return jsonResponse(
      {
        error:
          'Edge Function is misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY missing',
      },
      500,
      cors,
    )
  }

  // Caller-identity check: the platform's verify_jwt only confirms the
  // bearer token is SOME validly-signed JWT for this project — the public
  // anon key (shipped in the frontend bundle, not secret) satisfies that.
  // To make sure this is actually the coach's logged-in session (not just
  // anyone with the anon key), verify the token against Supabase Auth
  // using an anon-key client before doing any DB work with the service
  // role key.
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization')
  const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) {
    return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401, cors)
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: userData, error: userError } = await anonClient.auth.getUser(token)
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401, cors)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    let body: any
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'Invalid JSON body')
    }

    switch (body?.action) {
      case 'chat': {
        const result = await handleChat(supabase, body)
        return jsonResponse(result, 200, cors)
      }
      case 'generate_plan': {
        const result = await handleGeneratePlan(supabase, body)
        return jsonResponse(result, 200, cors)
      }
      case 'update_profile': {
        const result = await handleUpdateProfile(supabase, body)
        return jsonResponse(result, 200, cors)
      }
      default:
        throw new HttpError(400, `Unknown or missing action: ${body?.action}`)
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('coach-ai error:', message)
    return jsonResponse({ error: message }, status, cors)
  }
})

function jsonResponse(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}
