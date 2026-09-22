import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import type { SuggestedInsight } from '../types'

interface ChatResponse {
  reply: string
  suggested_insight: SuggestedInsight | null
}

interface GeneratePlanResponse {
  plan: string
}

export type ProfileUpdateMode = 'incremental' | 'rebuild'

interface UpdateProfileResponse {
  status: 'updated' | 'up_to_date' | 'no_logs' | 'conflict'
  logs_incorporated: number
}

// For non-2xx responses the client's own message is just "Edge Function
// returned a non-2xx status code"; the useful text is in the JSON body.
async function describeFunctionError(error: Error): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json()
      if (typeof payload?.error === 'string') return payload.error
    } catch {
      // Body wasn't JSON — fall back to the generic message.
    }
  }
  return error.message || 'coach-ai request failed'
}

async function invokeCoachAi<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('coach-ai', { body })
  if (error) {
    throw new Error(await describeFunctionError(error))
  }
  if (!data) {
    throw new Error('coach-ai returned no data')
  }
  return data
}

export function sendChatMessage(params: {
  conversationId: string
  studentId: string
  message: string
}): Promise<ChatResponse> {
  return invokeCoachAi<ChatResponse>({
    action: 'chat',
    conversation_id: params.conversationId,
    student_id: params.studentId,
    message: params.message,
  })
}

export function generateLessonPlan(studentId: string): Promise<GeneratePlanResponse> {
  return invokeCoachAi<GeneratePlanResponse>({
    action: 'generate_plan',
    student_id: studentId,
  })
}

/**
 * Asks the README agent to fold new session logs into the student's README
 * ('incremental'), or to regenerate it from every log ('rebuild').
 */
export function updateStudentProfile(
  studentId: string,
  mode: ProfileUpdateMode = 'incremental',
): Promise<UpdateProfileResponse> {
  return invokeCoachAi<UpdateProfileResponse>({
    action: 'update_profile',
    student_id: studentId,
    mode,
  })
}
