import type { SessionLog } from '../types'
import { LogEntryItem } from './LogEntryItem'

export function LogEntryList({ logs }: { logs: SessionLog[] }) {
  if (logs.length === 0) {
    return <p className="muted">No session logs yet. Add one below after your next lesson.</p>
  }

  return (
    <ul className="log-entry-list">
      {logs.map((log) => (
        <LogEntryItem key={log.id} log={log} />
      ))}
    </ul>
  )
}
