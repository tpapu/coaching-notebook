export interface Student {
  id: string
  name: string
  skill_level: string | null
  notes: string | null
  archived: boolean
  created_at: string
  /** 0 = Sunday ... 6 = Saturday (JS Date.getDay() numbering). */
  lesson_days: number[]
  /** The living README the AI reads instead of the full log history. */
  profile_md: string | null
  profile_updated_at: string | null
  /** created_at of the newest session log already folded into the README. */
  profile_logs_through: string | null
}

export interface ProfileVersion {
  id: string
  student_id: string
  content: string
  saved_at: string
}

export interface SessionLog {
  id: string
  student_id: string
  session_date: string
  content: string
  tags: string[] | null
  created_at: string
}

export interface Conversation {
  id: string
  student_id: string
  title: string | null
  created_at: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  conversation_id: string
  role: ChatRole
  content: string
  created_at: string
}

export interface CoachingInsight {
  id: string
  skill_tag: string
  problem: string
  fix: string
  source_student_id: string | null
  source_log_id: string | null
  created_at: string
  last_confirmed_at: string | null
}

export interface LessonPlan {
  id: string
  student_id: string
  generated_at: string
  content: string
  used: boolean
}

/** A coaching insight proposed by the assistant during a chat turn, not yet saved. */
export interface SuggestedInsight {
  skill_tag: string
  problem: string
  fix: string
}
