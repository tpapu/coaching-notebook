import { useEffect, useState } from 'react'
import type { Student } from '../types'
import { createStudent, listStudents } from '../lib/db'
import {
  dayFilterLabel,
  describeDayFilter,
  matchesDayFilter,
  studentDays,
  todayDayIndex,
  type DayFilter,
} from '../lib/days'
import { supabase } from '../lib/supabaseClient'
import { StudentTabBar } from './StudentTabBar'
import { StudentTabPanel } from './StudentTabPanel'
import { InsightsBrowser } from './InsightsBrowser'

type TopLevelTab = 'student' | 'insights'

/**
 * Three-column app shell: StudentTabBar (day filter, student list, and the
 * active student's header card) on the left, the active pane's main content
 * in the middle, and that pane's history/list content on the right.
 *
 * The right column is a single DOM node (`historyEl`) that StudentTabPanel's
 * children portal their history content into — see LogPane / ProfilePane /
 * LessonPlanPane. Coach Chat has no history list, so `paneHasHistory` (kept
 * in sync by StudentTabPanel) collapses that column and widens the middle
 * one when it's showing.
 */
export function TabShell() {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null)
  const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>('student')
  const [dayFilter, setDayFilter] = useState<DayFilter>('all')
  const [historyEl, setHistoryEl] = useState<HTMLElement | null>(null)
  const [paneHasHistory, setPaneHasHistory] = useState(true)

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

  const showHistoryColumn = topLevelTab === 'student' && paneHasHistory

  const rosterNames = students
    .filter((s) => !s.archived && matchesDayFilter(s, dayFilter))
    .map((s) => s.name)
  const rosterText = rosterNames.length ? rosterNames.join(', ') : 'No students'

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* The day's/filtered roster, in place of a static app title — see index.html for the actual browser-tab title. */}
        <h1 className="roster-heading" title={`${dayFilterLabel(dayFilter)}: ${rosterText}`}>
          <span className="roster-day">{dayFilterLabel(dayFilter)}:</span> {rosterText}
        </h1>
        <button className="secondary small" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <div className={'workspace' + (showHistoryColumn ? '' : ' workspace-no-history')}>
        <StudentTabBar
          students={students}
          activeStudentId={activeStudentId}
          activeTopLevelTab={topLevelTab}
          dayFilter={dayFilter}
          activeStudent={topLevelTab === 'student' ? activeStudent : null}
          onStudentChange={handleStudentChange}
          onSelectStudent={(id) => {
            setActiveStudentId(id)
            setTopLevelTab('student')
          }}
          onSelectInsights={() => setTopLevelTab('insights')}
          onSelectDay={handleSelectDay}
          onAddStudent={handleAddStudent}
        />

        <main className="col-main">
          {error && <p className="error">{error}</p>}
          {loading && <p className="muted">Loading students…</p>}

          {!loading && topLevelTab === 'insights' && <InsightsBrowser students={students} />}

          {!loading && topLevelTab === 'student' && activeStudent && (
            // Keyed so every student gets a fresh panel: the sub-tab, README
            // editor and sync state must never carry over from another student.
            <StudentTabPanel
              key={activeStudent.id}
              student={activeStudent}
              onStudentChange={handleStudentChange}
              historyContainer={historyEl}
              onActivePaneChange={setPaneHasHistory}
            />
          )}

          {!loading && topLevelTab === 'student' && !activeStudent && (
            <p className="muted">
              {students.some((s) => !s.archived)
                ? `No students ${describeDayFilter(dayFilter)} yet. Add one with + Student, or set a student's lesson days from their Edit form.`
                : 'Add a student to get started.'}
            </p>
          )}
        </main>

        <aside className="col-history" ref={setHistoryEl} hidden={!showHistoryColumn} />
      </div>
    </div>
  )
}
