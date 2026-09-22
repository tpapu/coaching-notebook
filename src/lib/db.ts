// Thin data-access helpers around the Supabase client. Kept in one place so
// components stay focused on rendering rather than query-building.
import { supabase } from './supabaseClient'
import type {
  ChatMessage,
  Conversation,
  CoachingInsight,
  LessonPlan,
  ProfileVersion,
  SessionLog,
  Student,
} from '../types'

// --- students ---------------------------------------------------------

export async function listStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from('students')
    .select('*')
    .order('archived', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Student[]
}

export async function getStudent(id: string): Promise<Student> {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data as Student
}

export async function createStudent(input: {
  name: string
  skill_level?: string | null
  notes?: string | null
  lesson_days?: number[]
}): Promise<Student> {
  const { data, error } = await supabase.from('students').insert(input).select().single()
  if (error) throw new Error(error.message)
  return data as Student
}

export async function updateStudent(
  id: string,
  patch: Partial<Pick<Student, 'name' | 'skill_level' | 'notes' | 'archived' | 'lesson_days' | 'profile_md'>>,
): Promise<Student> {
  const { data, error } = await supabase.from('students').update(patch).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return data as Student
}

// --- student README history ----------------------------------------------

export async function listProfileVersions(studentId: string, limit = 15): Promise<ProfileVersion[]> {
  const { data, error } = await supabase
    .from('student_profile_versions')
    .select('*')
    .eq('student_id', studentId)
    .order('saved_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as ProfileVersion[]
}

// --- session logs -------------------------------------------------------

export async function listSessionLogs(studentId: string): Promise<SessionLog[]> {
  const { data, error } = await supabase
    .from('session_logs')
    .select('*')
    .eq('student_id', studentId)
    .order('session_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as SessionLog[]
}

/** How many logs the README hasn't absorbed yet (all of them if `since` is null). */
export async function countUnsyncedLogs(studentId: string, since: string | null): Promise<number> {
  let query = supabase
    .from('session_logs')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
  if (since) query = query.gt('created_at', since)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function createSessionLog(input: {
  student_id: string
  session_date: string
  content: string
  tags?: string[] | null
}): Promise<SessionLog> {
  const { data, error } = await supabase.from('session_logs').insert(input).select().single()
  if (error) throw new Error(error.message)
  return data as SessionLog
}

// --- conversations --------------------------------------------------------

/** Gets the most recent conversation for a student, creating one if none exists yet. */
export async function getOrCreateActiveConversation(studentId: string): Promise<Conversation> {
  const existing = await supabase
    .from('conversations')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return existing.data as Conversation

  const created = await supabase
    .from('conversations')
    .insert({ student_id: studentId, title: 'Coaching chat' })
    .select()
    .single()
  if (created.error) throw new Error(created.error.message)
  return created.data as Conversation
}

export async function listChatMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as ChatMessage[]
}

// --- coaching insights ------------------------------------------------

export async function listInsights(): Promise<CoachingInsight[]> {
  const { data, error } = await supabase
    .from('coaching_insights')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as CoachingInsight[]
}

export async function createInsight(input: {
  skill_tag: string
  problem: string
  fix: string
  source_student_id?: string | null
  source_log_id?: string | null
}): Promise<CoachingInsight> {
  const { data, error } = await supabase.from('coaching_insights').insert(input).select().single()
  if (error) throw new Error(error.message)
  return data as CoachingInsight
}

export async function deleteInsight(id: string): Promise<void> {
  const { error } = await supabase.from('coaching_insights').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// --- lesson plans -------------------------------------------------------

export async function listLessonPlans(studentId: string): Promise<LessonPlan[]> {
  const { data, error } = await supabase
    .from('lesson_plans')
    .select('*')
    .eq('student_id', studentId)
    .order('generated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as LessonPlan[]
}

export async function saveLessonPlan(input: {
  student_id: string
  content: string
}): Promise<LessonPlan> {
  const { data, error } = await supabase.from('lesson_plans').insert(input).select().single()
  if (error) throw new Error(error.message)
  return data as LessonPlan
}

export async function markLessonPlanUsed(id: string): Promise<void> {
  const { error } = await supabase.from('lesson_plans').update({ used: true }).eq('id', id)
  if (error) throw new Error(error.message)
}
