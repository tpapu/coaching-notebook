import type { SyntheticEvent } from 'react'

/**
 * Attach to a <details> element's onToggle. When the coach opens it (not
 * when it closes), scrolls it to the center of whichever scrollable
 * container holds it — e.g. a sidebar list with its own scrollbar — instead
 * of leaving the newly revealed content to appear off-screen.
 */
export function centerOnOpen(e: SyntheticEvent<HTMLDetailsElement>) {
  if (e.currentTarget.open) {
    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
