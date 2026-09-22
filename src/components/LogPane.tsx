import { useEffect, useState } from 'react'
import type { SessionLog } from '../types'
import { createSessionLog, listSessionLogs } from '../lib/db'
import { LogEntryList } from './LogEntryList'
import { LogEntryForm } from './LogEntryForm'

export function LogPane({ studentId, onLogSaved }: { studentId: string; onLogSaved?: () => void }) {
  const [logs, setLogs] = useState<SessionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listSessionLogs(studentId)
      .then((data) => {
        if (!cancelled) setLogs(data)
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

  async function handleAdd(input: { session_date: string; content: string; tags: string[] | null }) {
    const created = await createSessionLog({ student_id: studentId, ...input })
    setLogs((prev) =>
      [created, ...prev].sort(
        (a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime(),
      ),
    )
    onLogSaved?.()
  }

  return (
    <section className="log-pane">
      <LogEntryForm onSubmit={handleAdd} />
      {error && <p className="error">{error}</p>}
      {loading ? <p className="muted">Loading session logs…</p> : <LogEntryList logs={logs} />}
    </section>
  )
}
