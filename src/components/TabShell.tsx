import { useEffect, useState } from 'react'
import type { Student } from '../types'
import { createStudent, listStudents } from '../lib/db'
import { describeDayFilter, matchesDayFilter, studentDays, todayDayIndex, type DayFilter } from '../lib/days'
import { supabase } from '../lib/supabaseClient'
import { StudentTabBar } from './StudentTabBar'
import { StudentTabPanel } from './StudentTabPanel'
import { InsightsBrowser } from './InsightsBrowser'

type TopLevelTab = 'student' | 'insights'

export function TabShell() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null)
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>('student')
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')

  useEffect(() => {
    listStudents()
      .then((data) => {
        setStudents(data)
        const current = data.filter((s) => !s.archived)
        // Open on today's lessons if anyone is scheduled today; otherwise show everyone.
        const initialFilter: DayFilter = current.some((s) => studentDays(s).includes(todayDayIndex()))
          ? todayDayIndex()
          : 'all'
        setDayFilter(initialFilter)
        const first = current.find((s) => matchesDayFilter(s, initialFilter))
        if (first) setActiveStudentId(first.id)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const activeStudent = students.find((s) => s.id === activeStudentId) ?? null

  // If editing a student's lesson days moves them out of the selected day,
  // widen the filter so their tab doesn't vanish from under the coach.
  useEffect(() => {
    if (activeStudent && !activeStudent.archived && !matchesDayFilter(activeStudent, dayFilter)) {
      setDayFilter('all')
    }
  }, [activeStudent, dayFilter])

  async function handleAddStudent(name: string) {
    // Adding while a specific day is selected puts the new student on that day.
    const created = await createStudent({
      name,
      lesson_days: typeof dayFilter === 'number' ? [dayFilter] : [],
    })
    setStudents((prev) => [...prev, created])
    setActiveStudentId(created.id)
    setTopLevelTab('student')
  }

  function handleStudentChange(updated: Student) {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }

  function handleSelectDay(filter: DayFilter) {
    setDayFilter(filter)
    setTopLevelTab('student')
    const stillVisible =
      activeStudent && (activeStudent.archived || matchesDayFilter(activeStudent, filter))
    if (!stillVisible) {
      const first = students.find((s) => !s.archived && matchesDayFilter(s, filter))
      setActiveStudentId(first?.id ?? null)
    }
  }

  return (
    <div className="tab-shell">
      <header className="app-header">
        <h1>Coaching Notebook</h1>
        <button className="secondary small" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <StudentTabBar
        students={students}
        activeStudentId={activeStudentId}
        activeTopLevelTab={topLevelTab}
        dayFilter={dayFilter}
        onSelectStudent={(id) => {
          setActiveStudentId(id)
          setTopLevelTab('student')
        }}
        onSelectInsights={() => setTopLevelTab('insights')}
        onSelectDay={handleSelectDay}
        onAddStudent={handleAddStudent}
      />

      <main className="app-main">
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading students…</p>}

        {!loading && topLevelTab === 'insights' && <InsightsBrowser students={students} />}

        {!loading && topLevelTab === 'student' && activeStudent && (
          // Keyed so every student gets a fresh panel: the edit form, README
          // editor and sync state must never carry over from another student.
          <StudentTabPanel key={activeStudent.id} student={activeStudent} onStudentChange={handleStudentChange} />
        )}

        {!loading && topLevelTab === 'student' && !activeStudent && (
          <p className="muted">
            {students.some((s) => !s.archived)
              ? `No students ${describeDayFilter(dayFilter)} yet. Add one with + Student, or set a student's lesson days from their Edit form.`
              : 'Add a student to get started.'}
          </p>
        )}
      </main>
    </div>
  )
}
