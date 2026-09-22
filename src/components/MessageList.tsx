import type { ChatMessage } from '../types'

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return <p className="muted">Ask about drills, patterns you're seeing, or anything else about this student.</p>
  }

  return (
    <ul className="message-list">
      {messages.map((m) => (
        <li key={m.id} className={'message message-' + m.role}>
          <span className="message-role">{m.role === 'user' ? 'You' : 'Coach AI'}</span>
          <p>{m.content}</p>
        </li>
      ))}
    </ul>
  )
}
