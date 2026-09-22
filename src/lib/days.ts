import type { Student } from '../types'

// Days are stored as 0 = Sunday ... 6 = Saturday (JS Date.getDay()). The UI
// shows them Monday-first, which is how a coaching week reads.
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export type DayFilter = 'all' | 'unscheduled' | number

// Tolerates rows fetched before the lesson_days migration has been run.
export function studentDays(student: Pick<Student, 'lesson_days'>): number[] {
  return student.lesson_days ?? []
}

export function matchesDayFilter(student: Pick<Student, 'lesson_days'>, filter: DayFilter): boolean {
  const days = studentDays(student)
  if (filter === 'all') return true
  if (filter === 'unscheduled') return days.length === 0
  return days.includes(filter)
}

export function formatLessonDays(days: number[]): string {
  return DAY_ORDER.filter((d) => days.includes(d))
    .map((d) => DAY_SHORT[d])
    .join(' · ')
}

/** The coach's local weekday, not UTC. */
export function todayDayIndex(): number {
  return new Date().getDay()
}

/** Fits "No students ___ yet." */
export function describeDayFilter(filter: DayFilter): string {
  if (filter === 'all') return 'here'
  if (filter === 'unscheduled') return 'without a lesson day'
  return `on ${DAY_LONG[filter]}`
}
