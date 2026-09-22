import type { SuggestedInsight } from '../types'

interface Props {
  suggestion: SuggestedInsight
  onConfirm: () => Promise<void>
  onDismiss: () => void
  saving: boolean
}

export function SuggestedInsightBanner({ suggestion, onConfirm, onDismiss, saving }: Props) {
  return (
    <div className="suggested-insight-banner card">
      <p className="suggested-insight-label">Save this as a coaching insight?</p>
      <p>
        <strong>[{suggestion.skill_tag}]</strong> Problem: {suggestion.problem}
      </p>
      <p>Fix: {suggestion.fix}</p>
      <div className="suggested-insight-actions">
        <button onClick={onConfirm} disabled={saving}>
          {saving ? 'Saving…' : 'Save insight'}
        </button>
        <button className="secondary" onClick={onDismiss} disabled={saving}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
