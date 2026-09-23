import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Student } from '../types'
import { DAY_ORDER, DAY_SHORT, matchesDayFilter, todayDayIndex, type DayFilter } from '../lib/days'
import { StudentHeader } from './StudentHeader'

interface Props {
  students: Student[]
  activeStudentId: string | null
  activeTopLevelTab: 'student' | 'insights'
  dayFilter: DayFilter
  /** The active student's header card renders here, or null on the Insights tab. */
  activeStudent: Student | null
  onStudentChange: (updated: Student) => void
  onSelectStudent: (id: string) => void
  onSelectInsights: () => void
  onSelectDay: (filter: DayFilter) => void
  onAddStudent: (name: string) => Promise<void>
}

/**
 * The app's persistent left column (see .col-nav in index.css): day filter,
 * student list, Insights Library link, and — when a student is active — that
 * student's editable header card. Stacked vertically since it's a narrow
 * column, not a horizontal bar.
 */
export function StudentTabBar({
  students,
  activeStudentId,
  activeTopLevelTab,
  dayFilter,
  activeStudent,
  onStudentChange,
  onSelectStudent,
  onSelectInsights,
  onSelectDay,
  onAddStudent,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const active = students.filter((s) => !s.archived)
  const archived = students.filter((s) => s.archived)
  const today = todayDayIndex()
  const unscheduledCount = active.filter((s) => matchesDayFilter(s, 'unscheduled')).length

  async function handleAddSubmit(e: FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true)
    try {
      await onAddStudent(newName.trim())
      setNewName('')
      setAdding(false)
    } finally {
      setBusy(false)
    }
  }

  function dayChip(filter: DayFilter, label: string, count: number, isToday = false) {
    const selected = dayFilter === filter
    return (
      <button
        key={String(filter)}
        className={
          'day-chip' +
          (selected ? ' day-chip-active' : '') +
          (isToday ? ' day-chip-today' : '') +
          (count === 0 && !selected ? ' day-chip-empty' : '')
        }
        aria-pressed={selected}
        title={isToday ? 'Today' : undefined}
        onClick={() => onSelectDay(filter)}
      >
        {label} <span className="day-count">{count}</span>
      </button>
    )
  }

  return (
    <nav className="col-nav">
      <div className="day-filter" role="group" aria-label="Filter students by lesson day">
        {dayChip('all', 'All', active.length)}
        {DAY_ORDER.map((day) =>
          dayChip(day, DAY_SHORT[day], active.filter((s) => matchesDayFilter(s, day)).length, day === today),
        )}
        {unscheduledCount > 0 && dayChip('unscheduled', 'Unscheduled', unscheduledCount)}
      </div>

      <div className="student-list">
        {active.map((student) => (
          <button
            key={student.id}
            className={
              'nav-item' +
              (activeTopLevelTab === 'student' && activeStudentId === student.id ? ' nav-item-active' : '')
            }
            onClick={() => onSelectStudent(student.id)}
          >
            {student.name}
          </button>
        ))}

        {adding ? (
          <form className="add-student-form" onSubmit={handleAddSubmit}>
            <input
              autoFocus
              placeholder="Student name"
              value={newName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              onBlur={() => {
                if (!newName.trim()) setAdding(false)
              }}
            />
            <button type="submit" disabled={busy}>
              Add
            </button>
          </form>
        ) : (
          <button className="nav-item nav-item-add" onClick={() => setAdding(true)}>
            + Student
          </button>
        )}
      </div>

      {archived.length > 0 && (
        <details className="archived-students">
          <summary>Archived ({archived.length})</summary>
          {archived.map((student) => (
            <button
              key={student.id}
              className={
                'nav-item' +
                (activeTopLevelTab === 'student' && activeStudentId === student.id ? ' nav-item-active' : '')
              }
              onClick={() => onSelectStudent(student.id)}
            >
              {student.name}
            </button>
          ))}
        </details>
      )}

      <button
        className={'nav-item nav-item-insights' + (activeTopLevelTab === 'insights' ? ' nav-item-active' : '')}
        onClick={onSelectInsights}
      >
        Insights Library
      </button>

      {activeStudent && <StudentHeader student={activeStudent} onChange={onStudentChange} />}
    </nav>
  )
}
