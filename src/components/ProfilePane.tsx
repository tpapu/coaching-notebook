import { useEffect, useState, type ChangeEvent } from 'react'
import type { ProfileVersion, Student } from '../types'
import type { ProfileUpdateMode } from '../lib/coachAi'
import { countUnsyncedLogs, listProfileVersions, updateStudent } from '../lib/db'

interface Props {
  student: Student
  syncing: boolean
  onSync: (mode: ProfileUpdateMode) => void
  onStudentChange: (updated: Student) => void
}

export function ProfilePane({ student, syncing, onSync, onStudentChange }: Props) {
  const saved = student.profile_md ?? ''
  const [draft, setDraft] = useState(saved)
  // The README text the editor was last in step with; draft !== baseline means unsaved edits.
  const [baseline, setBaseline] = useState(saved)
  const [stale, setStale] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unsynced, setUnsynced] = useState<number | null>(null)
  const [versions, setVersions] = useState<ProfileVersion[]>([])

  const dirty = draft !== baseline
  const hasReadme = saved.trim().length > 0

  // When the README changes underneath us (the agent finished an update):
  // adopt it silently if there are no unsaved edits, otherwise keep the
  // coach's edits and flag that a newer version exists.
  useEffect(() => {
    if (saved === baseline) return
    if (draft === baseline) {
      setDraft(saved)
      setBaseline(saved)
    } else {
      setStale(true)
    }
    // Deliberately keyed on the README only, not on every keystroke.
  }, [saved])

  useEffect(() => {
    let cancelled = false
    countUnsyncedLogs(student.id, student.profile_logs_through)
      .then((n) => {
        if (!cancelled) setUnsynced(n)
      })
      .catch(() => {
        if (!cancelled) setUnsynced(null)
      })
    return () => {
      cancelled = true
    }
  }, [student.id, student.profile_logs_through, student.profile_updated_at, syncing])

  useEffect(() => {
    let cancelled = false
    listProfileVersions(student.id)
      .then((rows) => {
        if (!cancelled) setVersions(rows)
      })
      .catch(() => {
        if (!cancelled) setVersions([])
      })
    return () => {
      cancelled = true
    }
  }, [student.id, student.profile_updated_at])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateStudent(student.id, { profile_md: draft.trim() || null })
      const next = updated.profile_md ?? ''
      setDraft(next)
      setBaseline(next)
      setStale(false)
      onStudentChange(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save README')
    } finally {
      setSaving(false)
    }
  }

  function loadLatest() {
    setDraft(saved)
    setBaseline(saved)
    setStale(false)
  }

  function handleRebuild() {
    const ok = window.confirm(
      'Rebuild the README from every session log?\n\n' +
        'It is regenerated from scratch, so hand edits that are not backed by your logs may be lost. ' +
        'The current README is kept under "Previous versions" so you can restore it.',
    )
    if (ok) onSync('rebuild')
  }

  let status = ''
  if (syncing) status = 'Updating the README from your session logs…'
  else if (unsynced === null) status = ''
  else if (unsynced > 0) status = `${unsynced} session log${unsynced === 1 ? '' : 's'} not in the README yet`
  else if (hasReadme) status = 'Up to date with all session logs'

  return (
    <section className="profile-pane">
      <div className="card profile-status">
        <div>
          {status && <p className="profile-status-line">{status}</p>}
          {student.profile_updated_at && (
            <p className="muted small">Last updated {new Date(student.profile_updated_at).toLocaleString()}</p>
          )}
        </div>
        <div className="profile-status-actions">
          <button onClick={() => onSync('incremental')} disabled={syncing || !unsynced}>
            {hasReadme ? 'Update from new logs' : 'Build README from logs'}
          </button>
          {hasReadme && (
            <button className="secondary" onClick={handleRebuild} disabled={syncing}>
              Rebuild from all logs
            </button>
          )}
        </div>
      </div>

      <p className="muted small">
        This is what the assistant reads about {student.name} before every chat and lesson plan, so it
        doesn&apos;t have to re-read the whole log history. It updates automatically after each session log —
        edit it any time and your changes are kept.
      </p>

      <div className="card">
        <textarea
          className="profile-editor"
          rows={22}
          value={draft}
          placeholder="No README yet. Save a session log and it will be written for you, or type one here."
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        />
        {stale && (
          <p className="notice">
            The README was updated while you were editing. Your unsaved edits are still here.{' '}
            <button className="secondary small" onClick={loadLatest}>
              Discard mine and load the latest
            </button>
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="profile-actions">
          <button onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save README'}
          </button>
          {dirty && (
            <button className="secondary" onClick={loadLatest} disabled={saving}>
              Discard changes
            </button>
          )}
        </div>
      </div>

      {versions.length > 0 && (
        <details className="card profile-history">
          <summary>Previous versions ({versions.length})</summary>
          <ul>
            {versions.map((version) => (
              <li key={version.id}>
                <span>{new Date(version.saved_at).toLocaleString()}</span>
                <button className="secondary small" onClick={() => setDraft(version.content)}>
                  Load into editor
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">Loading a version only fills the editor — nothing changes until you save.</p>
        </details>
      )}
    </section>
  )
}
