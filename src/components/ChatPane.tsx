import { useEffect, useState } from 'react'
import type { ChatMessage, SuggestedInsight } from '../types'
import { getOrCreateActiveConversation, listChatMessages, createInsight } from '../lib/db'
import { sendChatMessage } from '../lib/coachAi'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { SuggestedInsightBanner } from './SuggestedInsightBanner'

export function ChatPane({ studentId }: { studentId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [suggestion, setSuggestion] = useState<SuggestedInsight | null>(null)
  const [savingInsight, setSavingInsight] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSuggestion(null)
    getOrCreateActiveConversation(studentId)
      .then(async (conversation) => {
        if (cancelled) return
        setConversationId(conversation.id)
        const existingMessages = await listChatMessages(conversation.id)
        if (!cancelled) setMessages(existingMessages)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  async function handleSend(message: string) {
    if (!conversationId) return
    setError(null)
    setSuggestion(null)

    // Optimistically show the user's message; the Edge Function persists both
    // sides, so we reconcile with the real rows implicitly on next load. For
    // immediate feedback we just append locally with a temp id.
    const optimisticUserMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticUserMessage])

    try {
      const result = await sendChatMessage({ conversationId, studentId, message })
      const assistantMessage: ChatMessage = {
        id: `local-reply-${Date.now()}`,
        conversation_id: conversationId,
        role: 'assistant',
        content: result.reply,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      if (result.suggested_insight) setSuggestion(result.suggested_insight)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }

  async function handleConfirmInsight() {
    if (!suggestion) return
    setSavingInsight(true)
    try {
      await createInsight({
        skill_tag: suggestion.skill_tag,
        problem: suggestion.problem,
        fix: suggestion.fix,
        source_student_id: studentId,
      })
      setSuggestion(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save insight')
    } finally {
      setSavingInsight(false)
    }
  }

  if (loading) return <p className="muted">Loading conversation…</p>

  return (
    <section className="chat-pane">
      <MessageList messages={messages} />
      {suggestion && (
        <SuggestedInsightBanner
          suggestion={suggestion}
          onConfirm={handleConfirmInsight}
          onDismiss={() => setSuggestion(null)}
          saving={savingInsight}
        />
      )}
      {error && <p className="error">{error}</p>}
      <MessageInput onSend={handleSend} disabled={!conversationId} />
    </section>
  )
}
