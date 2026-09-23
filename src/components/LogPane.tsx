import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionLog } from '../types'
import { createSessionLog, listSessionLogs } from '../lib/db'
import { LogEntryList } from './LogEntryList'
import { LogEntryForm } from './LogEntryForm'

interface Props {
  studentId: string
  onLogSaved?: () => void
  /** The right-hand column DOM node to portal "Session history" into. */
  historyContainer: HTMLElement | null
  /** Only portal while this is the visible sub-tab, since a hidden ancestor doesn't hide a portal's target. */
  isActive: boolean
}

export function LogPane({ studentId, onLogSaved, historyContainer, isActive }: Props) {
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
    <>
      <LogEntryForm onSubmit={handleAdd} />
      {error && <p className="error">{error}</p>}
      {isActive &&
        historyContainer &&
        createPortal(
          <>
            <h3>Session history</h3>
            {loading ? <p className="muted">Loading session logs…</p> : <LogEntryList logs={logs} />}
          </>,
          historyContainer,
        )}
    </>
  )
}
