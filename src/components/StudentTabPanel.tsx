import { useEffect, useRef, useState } from 'react'
import type { Student } from '../types'
import { getStudent } from '../lib/db'
import { updateStudentProfile, type ProfileUpdateMode } from '../lib/coachAi'
import { LogPane } from './LogPane'
import { ProfilePane } from './ProfilePane'
import { ChatPane } from './ChatPane'
import { LessonPlanPane } from './LessonPlanPane'

type SubTab = 'logs' | 'profile' | 'chat' | 'plan'

interface Props {
  student: Student
  onStudentChange: (updated: Student) => void
  /** The right-hand column's DOM node (owned by TabShell) that panes portal their history content into. */
  historyContainer: HTMLElement | null
  /** Lets TabShell collapse the history column when the active sub-tab has none (Coach Chat). */
  onActivePaneChange?: (hasHistory: boolean) => void
}

/**
 * Per-student workspace (TabShell mounts one per student, keyed by id). Each
 * sub-pane fetches its own data lazily — nothing loads until its tab is
 * opened, and once opened it stays mounted so switching back doesn't refetch.
 * Session Logs, README and Lesson Plan additionally portal a history list
 * into `historyContainer`; Coach Chat has none.
 *
 * This component also owns the README sync, since it is triggered from the
 * Logs tab (after saving a log) but shown on the README tab.
 */
export function StudentTabPanel({ student, onStudentChange, historyContainer, onActivePaneChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('logs')
  const [visited, setVisited] = useState<Set<SubTab>>(new Set(['logs']))
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const runAgain = useRef(false)

  useEffect(() => {
    onActivePaneChange?.(subTab !== 'chat')
  }, [subTab, onActivePaneChange])

  function selectTab(tab: SubTab) {
    setSubTab(tab)
    setVisited((prev) => new Set(prev).add(tab))
  }

  async function syncProfile(mode: ProfileUpdateMode = 'incremental') {
    if (inFlight.current) {
      // A log was saved while an update was running; that run may not have
      // seen it, so go around once more when it finishes.
      runAgain.current = true
      return
    }
    inFlight.current = true
    setSyncing(true)
    setSyncError(null)
    try {
      let passMode = mode
      do {
        runAgain.current = false
        const result = await updateStudentProfile(student.id, passMode)
        if (result.status === 'conflict') {
          throw new Error('The README kept changing while it was being updated. Try again.')
        }
        passMode = 'incremental'
      } while (runAgain.current)
      onStudentChange(await getStudent(student.id))
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'README update failed')
    } finally {
      inFlight.current = false
      setSyncing(false)
    }
  }

  return (
    <div className="student-tab-panel">
      <div className="sub-tab-bar">
        <button className={subTab === 'logs' ? 'tab tab-active' : 'tab'} onClick={() => selectTab('logs')}>
          Session Logs
        </button>
        <button className={subTab === 'profile' ? 'tab tab-active' : 'tab'} onClick={() => selectTab('profile')}>
          README
        </button>
        <button className={subTab === 'chat' ? 'tab tab-active' : 'tab'} onClick={() => selectTab('chat')}>
          Coach Chat
        </button>
        <button className={subTab === 'plan' ? 'tab tab-active' : 'tab'} onClick={() => selectTab('plan')}>
          Lesson Plan
        </button>
      </div>

      {syncing && subTab !== 'profile' && <p className="muted small">Updating the README…</p>}
      {syncError && (
        <p className="error small">
          README update failed: {syncError}{' '}
          <button className="secondary small" onClick={() => void syncProfile()} disabled={syncing}>
            Retry
          </button>
        </p>
      )}

      <div className="sub-tab-content">
        {visited.has('logs') && (
          <div hidden={subTab !== 'logs'}>
            <LogPane
              studentId={student.id}
              onLogSaved={() => void syncProfile()}
              historyContainer={historyContainer}
              isActive={subTab === 'logs'}
            />
          </div>
        )}
        {visited.has('profile') && (
          <div hidden={subTab !== 'profile'}>
            <ProfilePane
              student={student}
              syncing={syncing}
              onSync={(mode) => void syncProfile(mode)}
              onStudentChange={onStudentChange}
              historyContainer={historyContainer}
              isActive={subTab === 'profile'}
            />
          </div>
        )}
        {visited.has('chat') && (
          <div hidden={subTab !== 'chat'}>
            <ChatPane studentId={student.id} />
          </div>
        )}
        {visited.has('plan') && (
          <div hidden={subTab !== 'plan'}>
            <LessonPlanPane studentId={student.id} historyContainer={historyContainer} isActive={subTab === 'plan'} />
          </div>
        )}
      </div>
    </div>
  )
}
