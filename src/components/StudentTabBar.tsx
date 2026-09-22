import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Student } from '../types'
import { DAY_ORDER, DAY_SHORT, matchesDayFilter, todayDayIndex, type DayFilter } from '../lib/days'

interface Props {
  students: Student[]
  activeStudentId: string | null
  activeTopLevelTab: 'student' | 'insights'
  dayFilter: DayFilter
  onSelectStudent: (id: string) => void
  onSelectInsights: () => void
  onSelectDay: (filter: DayFilter) => void
  onAddStudent: (name: string) => Promise<void>
}

export function StudentTabBar({
  students,
  activeStudentId,
  activeTopLevelTab,
  dayFilter,
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
  const visible = active.filter((s) => matchesDayFilter(s, dayFilter))
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
    <nav className="student-tab-bar">
      <div className="day-filter" role="group" aria-label="Filter students by lesson day">
        {dayChip('all', 'All', active.length)}
        {DAY_ORDER.map((day) =>
          dayChip(day, DAY_SHORT[day], active.filter((s) => matchesDayFilter(s, day)).length, day === today),
        )}
        {unscheduledCount > 0 && dayChip('unscheduled', 'Unscheduled', unscheduledCount)}
      </div>

      <div className="tab-group">
        {visible.map((student) => (
          <button
            key={student.id}
            className={
              'tab' + (activeTopLevelTab === 'student' && activeStudentId === student.id ? ' tab-active' : '')
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
          <button className="tab tab-add" onClick={() => setAdding(true)}>
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
                'tab tab-archived' +
                (activeTopLevelTab === 'student' && activeStudentId === student.id ? ' tab-active' : '')
              }
              onClick={() => onSelectStudent(student.id)}
            >
              {student.name}
            </button>
          ))}
        </details>
      )}

      <div className="tab-group tab-group-right">
        <button
          className={'tab' + (activeTopLevelTab === 'insights' ? ' tab-active' : '')}
          onClick={onSelectInsights}
        >
          Insights Library
        </button>
      </div>
    </nav>
  )
}
