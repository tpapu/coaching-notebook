import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { CoachingInsight, Student } from '../types'
import { createInsight, deleteInsight, listInsights } from '../lib/db'

interface Props {
  students: Student[]
}

export function InsightsBrowser({ students }: Props) {
  const [insights, setInsights] = useState<CoachingInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    listInsights()
      .then(setInsights)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const studentsById = useMemo(() => {
    const map = new Map<string, Student>()
    students.forEach((s) => map.set(s.id, s))
    return map
  }, [students])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return insights
    return insights.filter(
      (i) =>
        i.skill_tag.toLowerCase().includes(q) ||
        i.problem.toLowerCase().includes(q) ||
        i.fix.toLowerCase().includes(q),
    )
  }, [insights, search])

  async function handleDelete(id: string) {
    if (!confirm('Delete this coaching insight? This cannot be undone.')) return
    setError(null)
    try {
      await deleteInsight(id)
      setInsights((prev) => prev.filter((i) => i.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete insight')
    }
  }

  return (
    <section className="insights-browser">
      <h2>Coaching Insights Library</h2>
      <p className="muted">
        Reusable patterns across all students. These are only added here when you explicitly save
        them — either from a chat suggestion or manually below.
      </p>

      <AddInsightForm
        onAdd={async (input) => {
          const created = await createInsight(input)
          setInsights((prev) => [created, ...prev])
        }}
        onError={setError}
      />

      <input
        className="insights-search"
        placeholder="Search by tag, problem, or fix…"
        value={search}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
      />

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="muted">Loading insights…</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No coaching insights yet.</p>
      ) : (
        <ul className="insight-list">
          {filtered.map((insight) => (
            <li key={insight.id} className="card insight-item">
              <div className="insight-item-header">
                <span className="pill">{insight.skill_tag}</span>
                {insight.source_student_id && studentsById.get(insight.source_student_id) && (
                  <span className="muted small">
                    from {studentsById.get(insight.source_student_id)!.name}
                  </span>
                )}
                <button className="secondary small" onClick={() => handleDelete(insight.id)}>
                  Delete
                </button>
              </div>
              <p>
                <strong>Problem:</strong> {insight.problem}
              </p>
              <p>
                <strong>Fix:</strong> {insight.fix}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddInsightForm({
  onAdd,
  onError,
}: {
  onAdd: (input: { skill_tag: string; problem: string; fix: string }) => Promise<void>
  onError: (message: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [skillTag, setSkillTag] = useState('')
  const [problem, setProblem] = useState('')
  const [fix, setFix] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!skillTag.trim() || !problem.trim() || !fix.trim()) return
    setSaving(true)
    onError(null)
    try {
      await onAdd({ skill_tag: skillTag.trim(), problem: problem.trim(), fix: fix.trim() })
      setSkillTag('')
      setProblem('')
      setFix('')
      setOpen(false)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save insight')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button className="secondary" onClick={() => setOpen(true)}>
        + Add insight manually
      </button>
    )
  }

  return (
    <form className="card add-insight-form" onSubmit={handleSubmit}>
      <label>
        Skill tag
        <input value={skillTag} onChange={(e: ChangeEvent<HTMLInputElement>) => setSkillTag(e.target.value)} required />
      </label>
      <label>
        Problem
        <textarea rows={2} value={problem} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setProblem(e.target.value)} required />
      </label>
      <label>
        Fix
        <textarea rows={2} value={fix} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setFix(e.target.value)} required />
      </label>
      <div className="lesson-plan-actions">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save insight'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}
