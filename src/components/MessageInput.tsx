import { useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react'

interface Props {
  onSend: (message: string) => Promise<void>
  disabled?: boolean
}

export function MessageInput({ onSend, disabled }: Props) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const message = value.trim()
    if (!message) return
    setSending(true)
    setValue('')
    try {
      await onSend(message)
    } finally {
      setSending(false)
    }
  }

  const busy = disabled || sending

  return (
    <form className="message-input" onSubmit={handleSubmit}>
      <textarea
        rows={2}
        value={value}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setValue(e.target.value)}
        placeholder="Ask the coaching assistant…"
        disabled={busy}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit(e)
          }
        }}
      />
      <button type="submit" disabled={busy || !value.trim()}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  )
}
