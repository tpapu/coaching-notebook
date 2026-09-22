# Coaching Notebook

A personal, single-user tennis coaching journal. Log what happens in each
lesson, chat with an AI assistant that has read your notes on that student,
generate lesson plans grounded in session history, and build up a library of
reusable coaching insights across all your students.

This app is built for one coach (one login) running their own Supabase
project and their own Anthropic API key — there's no multi-tenant account
system, billing, or public sign-up.

## Stack

- **Frontend:** React + TypeScript, built with Vite. Plain React state and
  the Supabase JS client for data — no Redux, no heavy UI framework.
- **Database/auth:** Supabase (Postgres + Supabase Auth).
- **AI:** One Supabase Edge Function (`coach-ai`) that calls the Anthropic
  Messages API server-side. The Anthropic key and the Supabase service role
  key never reach the browser.

## Project layout

```
src/
  components/     React components (see below)
  lib/
    supabaseClient.ts   Supabase JS client (anon key, browser-safe)
    coachAi.ts           Frontend wrapper around the coach-ai Edge Function
    db.ts                CRUD helpers for students/logs/insights/plans
    days.ts              Lesson-day helpers (Mon–Sun labels, day filtering)
  types/          Shared TypeScript types mirroring the DB schema
supabase/
  migrations/0001_init.sql                          Full schema + RLS policies
  migrations/0002_lesson_days_and_student_readme.sql  Lesson days + student README
  functions/coach-ai/                               The Edge Function (Deno)
```

Component tree:

```
App -> AuthGate -> TabShell
  StudentTabBar (day filter Mon–Sun, student tabs, add + archive students)
  StudentTabPanel (per active student; also runs the README sync)
    StudentHeader (name, skill level, lesson days, notes — editable)
    LogPane (LogEntryForm, LogEntryList, LogEntryItem)
    ProfilePane (the student's README: view/edit, sync status, version history)
    ChatPane (MessageList, MessageInput, SuggestedInsightBanner)
    LessonPlanPane (generate, edit draft, save)
  InsightsBrowser (top-level tab: browse/search/manually add insights)
```

## 1. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. In the SQL editor (or via the CLI, see below), run the migrations in order:
   `supabase/migrations/0001_init.sql`, then
   `supabase/migrations/0002_lesson_days_and_student_readme.sql`. The first
   creates all six tables (`students`, `session_logs`, `conversations`,
   `chat_messages`, `coaching_insights`, `lesson_plans`), their indexes, and
   Row Level Security policies that allow any authenticated user full access
   (this app assumes exactly one such user — you). The second adds lesson
   days and the per-student README (plus a `student_profile_versions` history
   table); it is safe to re-run.

   With the Supabase CLI installed and linked to your project:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

3. Create your one user account: Supabase Dashboard → Authentication →
   Users → **Add user** (set an email + password you'll log in with). There's
   no sign-up screen in the app on purpose.
4. Grab your project URL and anon key from Settings → API.

## 2. Configure the frontend

```bash
cp .env.example .env
```

Fill in:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

These are safe to expose to the browser — the anon key only works within
whatever your RLS policies allow (here: authenticated users only).

**Do not** put `ANTHROPIC_API_KEY` or your service role key in `.env` — those
belong only on the Edge Function (next step).

## 3. Deploy the Edge Function

Install the [Supabase CLI](https://supabase.com/docs/guides/cli) if you
haven't already, then from the project root:

```bash
supabase functions deploy coach-ai
```

Set its secrets (these live only in the deployed function's environment,
never in the frontend bundle):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are
automatically injected into every Edge Function by Supabase, so you don't
need to set those yourself. The function uses the anon key only to verify
the caller's JWT against Supabase Auth (`auth.getUser`) before doing any DB
work with the service role key — this is what stops someone who has merely
copied the public anon key out of the deployed frontend from calling the
function directly.

Optionally override the model (defaults to `claude-sonnet-4-5-20250929`):

```bash
supabase secrets set ANTHROPIC_MODEL=claude-opus-4-1-20250805
```

The function only accepts browser requests from an allowlisted origin (CORS),
not from any website. It defaults to `http://localhost:5173` and
`http://127.0.0.1:5173` for local dev. Once you deploy the frontend somewhere
(GitHub Pages, Cloudflare Pages, etc.), add that URL too:

```bash
supabase secrets set ALLOWED_ORIGINS=https://your-app.pages.dev,http://localhost:5173
```

If you skip this, requests from your deployed site will fail in the browser
with a CORS error even though the login/auth check would have passed.

To iterate locally against a local Supabase stack, `supabase functions serve
coach-ai --env-file supabase/functions/.env.local` works the same way — just
keep that env file out of git (it already matches the `.gitignore` patterns).

## 4. Run the frontend

```bash
npm install
npm run dev
```

Open the printed local URL, sign in with the user you created in step 1.3,
and add your first student.

`npm run build` type-checks the whole app (`tsc -b`) and produces a
production build in `dist/`.

## How the AI features work

- **Student README** (per student): a living markdown profile — snapshot,
  strengths, what you're working on, recurring issues and what fixed them,
  cues/drills that work for that student, a compressed progress timeline, and
  next-lesson ideas. A small "README agent" (the `update_profile` action in
  the Edge Function) maintains it: every time you save a session log, the app
  asks it to fold the new log into the README. It updates incrementally (only
  logs newer than the README's `profile_logs_through` watermark), never
  invents facts the logs don't support, and preserves your hand edits. You can
  edit the README yourself on the README tab; **Rebuild from all logs**
  regenerates it from scratch if it ever drifts. Every replaced version is
  archived in `student_profile_versions` (see "Previous versions" on the tab),
  and writes use a compare-and-swap on `profile_updated_at` so an update never
  overwrites an edit you made while it was running.
- **Coach Chat** (per student): every message you send is answered with the
  student's README, their most recent session logs, any logs not yet folded
  into the README, and the last ~20 messages of that conversation. So the
  assistant gets the long-term picture without re-reading the whole history.
  A student with no README yet falls back to the full log history. This is
  summary-memory, not embeddings/vector search — at one coach's scale it's
  simpler and more predictable; the trade-off is that a detail the README
  didn't keep from an old session isn't visible to the chat.
- **Suggested insights**: while chatting, if Claude notices something that
  would generalize to other students, it appends a small structured tag to
  its reply (parsed and stripped server-side) which the frontend shows as a
  "Save this as a coaching insight?" prompt. Nothing is written to
  `coaching_insights` unless you explicitly click Save — insights never leak
  across students automatically. (We chose "ask the same call to
  self-report a suggestion" over running a second classification call after
  every turn, since a second call adds latency/cost for something that only
  fires occasionally — worth revisiting if false positives/negatives become
  an issue.)
- **Lesson days**: each student can be assigned one or more lesson days
  (Edit on the student header). The tab bar has a Mon–Sun filter with counts;
  the app opens on today's students when anyone is scheduled today.
- **Lesson Plan generation**: sends the same per-student context (README +
  recent/unsummarized logs), plus *every* saved coaching insight (not
  filtered by tag). That part is a deliberate full-stuffing trade-off:
  tag-filtering would need either an extra classification step or the coach
  labeling insights precisely, and at realistic data volumes for one coach,
  sending everything is simpler and avoids a filter silently hiding a
  relevant insight. Generated plans are shown as an editable draft and are
  **not** saved until you click "Save to lesson plans".

## Known limitations / deliberately out of scope

- Single user only — the RLS policies grant full access to *any*
  authenticated user, so only ever create one Supabase Auth user for this
  project.
- No password reset / account management UI — use the Supabase dashboard.
- No pagination on session logs, chat history, or the insights list; fine at
  single-coach data volumes, would need addressing before this could support
  many students with years of history.
- No automatic retry/streaming on the chat response — a failed request just
  shows an error and the input is left ready to resend.
- This build was type-checked in a sandboxed environment without access to
  the public npm registry, so `npm install` itself was not exercised here —
  see the note in the delivery summary. The versions pinned in
  `package.json` are current stable releases as of writing; run
  `npm install` and `npm run build` yourself to do a full install + build
  before deploying.
