import { useState, type ChangeEvent, type FormEvent } from 'react'
import { dateOnlyToTimestamp } from '../lib/date'

interface Props {
  onSubmit: (input: { session_date: string; content: string; tags: string[] | null }) => Promise<void>
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LogEntryForm({ onSubmit }: Props) {
  const [date, setDate] = useState(todayIsoDate())
  const [content, setContent] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setSaving(true)
    setError(null)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await onSubmit({
        // Store the picked calendar date as UTC noon (not UTC midnight) so it
        // renders as the same day in every real-world timezone — see
        // src/lib/date.ts for why.
        session_date: dateOnlyToTimestamp(date),
        content: content.trim(),
        tags: tags.length ? tags : null,
      })
      setContent('')
      setTagsInput('')
      setDate(todayIsoDate())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save log entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="log-entry-form card" onSubmit={handleSubmit}>
      <h3>Log this session</h3>
      <label>
        Date
        <input type="date" value={date} onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)} required />
      </label>
      <label>
        What happened
        <textarea
          rows={4}
          value={content}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
          placeholder="What did you work on? What clicked, what didn't?"
          required
        />
      </label>
      <label>
        Tags (comma separated)
        <input
          value={tagsInput}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setTagsInput(e.target.value)}
          placeholder="serve, footwork, mental game"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save log entry'}
      </button>
    </form>
  )
}
