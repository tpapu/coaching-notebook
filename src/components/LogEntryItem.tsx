import type { SessionLog } from '../types'
import { formatSessionDate } from '../lib/date'

export function LogEntryItem({ log, defaultOpen = false }: { log: SessionLog; defaultOpen?: boolean }) {
  // Format in UTC (not local time) so this matches the calendar day the
  // coach actually picked, regardless of the viewer's timezone.
  const date = formatSessionDate(log.session_date)

  return (
    <li className="log-entry card">
      <details open={defaultOpen}>
        <summary className="log-entry-header">
          <span className="log-entry-date">{date}</span>
          {log.tags && log.tags.length > 0 && (
            <span className="tag-list">
              {log.tags.map((tag) => (
                <span key={tag} className="pill pill-tag">
                  {tag}
                </span>
              ))}
            </span>
          )}
        </summary>
        <p className="log-entry-content">{log.content}</p>
      </details>
    </li>
  )
}
