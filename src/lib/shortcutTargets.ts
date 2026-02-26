/**
 * Returns true when global shortcuts should be blocked for the current event target.
 *
 * We allow app-level shortcuts in the editor surface and in the sidebar search input,
 * but block them in ordinary form fields and non-editor contenteditable regions.
 */
export function shouldBlockGlobalShortcutsFromTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-search-input="true"]')) return false

  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (target.closest('.editor-shell')) return false

  return target.isContentEditable || Boolean(target.closest('[contenteditable="true"]'))
}
