import { useState, type ChangeEvent } from 'react'
import type { Student } from '../types'
import { updateStudent } from '../lib/db'
import { DAY_ORDER, DAY_SHORT, formatLessonDays, studentDays } from '../lib/days'

interface Props {
  student: Student
  onChange: (updated: Student) => void
}

export function StudentHeader({ student, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(student.name)
  const [skillLevel, setSkillLevel] = useState(student.skill_level ?? '')
  const [notes, setNotes] = useState(student.notes ?? '')
  const [days, setDays] = useState<number[]>(studentDays(student))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleDay(day: number) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateStudent(student.id, {
        name: name.trim() || student.name,
        skill_level: skillLevel.trim() || null,
        notes: notes.trim() || null,
        lesson_days: [...days].sort((a, b) => a - b),
      })
      onChange(updated)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveToggle() {
    setError(null)
    try {
      const updated = await updateStudent(student.id, { archived: !student.archived })
      onChange(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update archive status')
    }
  }

  if (!editing) {
    return (
      <header className="student-header card">
        <div className="student-header-main">
          <h2>{student.name}</h2>
          {student.skill_level && <span className="pill">{student.skill_level}</span>}
          {studentDays(student).length > 0 && (
            <span className="pill pill-days">{formatLessonDays(studentDays(student))}</span>
          )}
          {student.archived && <span className="pill pill-muted">Archived</span>}
        </div>
        {student.notes && <p className="muted student-notes">{student.notes}</p>}
        {error && <p className="error">{error}</p>}
        <div className="student-header-actions">
          <button onClick={() => setEditing(true)}>Edit</button>
          <button className="secondary" onClick={handleArchiveToggle}>
            {student.archived ? 'Unarchive' : 'Archive'}
          </button>
        </div>
      </header>
    )
  }

  return (
    <header className="student-header card">
      <label>
        Name
        <input value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
      </label>
      <label>
        Skill level
        <input
          value={skillLevel}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setSkillLevel(e.target.value)}
          placeholder="e.g. Intermediate, 3.5 NTRP"
        />
      </label>
      <fieldset className="day-picker">
        <legend>Lesson days</legend>
        {DAY_ORDER.map((day) => (
          <button
            key={day}
            type="button"
            className={'day-toggle' + (days.includes(day) ? ' day-toggle-on' : '')}
            aria-pressed={days.includes(day)}
            onClick={() => toggleDay(day)}
          >
            {DAY_SHORT[day]}
          </button>
        ))}
      </fieldset>
      <label>
        Standing notes
        <textarea rows={3} value={notes} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="student-header-actions">
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </header>
  )
}
