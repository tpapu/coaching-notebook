import { useRef, useState } from 'react'
import type { Student } from '../types'
import { getStudent } from '../lib/db'
import { updateStudentProfile, type ProfileUpdateMode } from '../lib/coachAi'
import { StudentHeader } from './StudentHeader'
import { LogPane } from './LogPane'
import { ProfilePane } from './ProfilePane'
import { ChatPane } from './ChatPane'
import { LessonPlanPane } from './LessonPlanPane'

type SubTab = 'logs' | 'profile' | 'chat' | 'plan'

interface Props {
  student: Student
  onStudentChange: (updated: Student) => void
}

/**
 * Per-student workspace (TabShell mounts one per student, keyed by id). Each
 * sub-pane fetches its own data lazily — nothing loads until its tab is
 * opened, and once opened it stays mounted so switching back doesn't refetch.
 *
 * This component also owns the README sync, since it is triggered from the
 * Logs tab (after saving a log) but shown on the README tab.
 */
export function StudentTabPanel({ student, onStudentChange }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('logs')
  const [visited, setVisited] = useState<Set<SubTab>>(new Set(['logs']))
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const runAgain = useRef(false)

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
      <StudentHeader student={student} onChange={onStudentChange} />

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
            <LogPane studentId={student.id} onLogSaved={() => void syncProfile()} />
          </div>
        )}
        {visited.has('profile') && (
          <div hidden={subTab !== 'profile'}>
            <ProfilePane
              student={student}
              syncing={syncing}
              onSync={(mode) => void syncProfile(mode)}
              onStudentChange={onStudentChange}
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
            <LessonPlanPane studentId={student.id} />
          </div>
        )}
      </div>
    </div>
  )
}
