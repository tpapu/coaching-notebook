import { useEffect, useState, type ChangeEvent } from 'react'
import type { LessonPlan } from '../types'
import { generateLessonPlan } from '../lib/coachAi'
import { listLessonPlans, saveLessonPlan } from '../lib/db'

export function LessonPlanPane({ studentId }: { studentId: string }) {
  const [pastPlans, setPastPlans] = useState<LessonPlan[]>([])
  const [draft, setDraft] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(null)
    setSaved(false)
    setError(null)
    listLessonPlans(studentId)
      .then(setPastPlans)
      .catch((err: Error) => setError(err.message))
  }, [studentId])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    setSaved(false)
    try {
      const result = await generateLessonPlan(studentId)
      setDraft(result.plan)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate lesson plan')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setError(null)
    try {
      const created = await saveLessonPlan({ student_id: studentId, content: draft })
      setPastPlans((prev) => [created, ...prev])
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lesson plan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="lesson-plan-pane">
      <div className="lesson-plan-header">
        <button onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate lesson plan'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {draft !== null && (
        <div className="card lesson-plan-draft">
          <h3>Draft plan</h3>
          <textarea
            rows={16}
            value={draft}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              setDraft(e.target.value)
              setSaved(false)
            }}
          />
          <div className="lesson-plan-actions">
            <button onClick={handleSave} disabled={saving || saved}>
              {saved ? 'Saved' : saving ? 'Saving…' : 'Save to lesson plans'}
            </button>
          </div>
        </div>
      )}

      <div className="lesson-plan-history">
        <h3>Past plans</h3>
        {pastPlans.length === 0 ? (
          <p className="muted">No saved lesson plans yet.</p>
        ) : (
          <ul className="lesson-plan-list">
            {pastPlans.map((plan, index) => (
              <li key={plan.id} className="card">
                {/* Most recent open by default so saving feels confirmed; older ones stay collapsed to avoid clutter. */}
                <details open={index === 0}>
                  <summary className="lesson-plan-list-header">
                    <span>{new Date(plan.generated_at).toLocaleDateString()}</span>
                    {plan.used && <span className="pill pill-muted">Used</span>}
                  </summary>
                  <p className="lesson-plan-content-full">{plan.content}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
