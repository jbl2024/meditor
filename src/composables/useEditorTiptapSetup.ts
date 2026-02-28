import type { EditorOptions } from '@tiptap/vue-3'

/**
 * useEditorTiptapSetup
 *
 * Purpose:
 * - Provide a reusable, testable builder for TipTap editor options.
 *
 * Responsibilities:
 * - Keep extension list assembly deterministic.
 * - Route update/selection/transaction callbacks through one contract.
 *
 * Boundaries:
 * - Does not instantiate editors; caller applies returned options.
 */
export type UseEditorTiptapSetupOptions = {
  extensions: NonNullable<Partial<EditorOptions>['extensions']>
  onUpdate: () => void
  onSelectionUpdate: () => void
  onDocChanged: () => void
}

export type LinkClickIntent = 'open-external' | 'edit-link' | 'open-wikilink' | 'ignore'

/**
 * Classifies click intent used by editor link handlers.
 */
export function classifyLinkClick(params: {
  hasWikilinkTarget: boolean
  hasExternalHref: boolean
  withModifier: boolean
}): LinkClickIntent {
  if (params.hasWikilinkTarget) {
    return params.withModifier ? 'edit-link' : 'open-wikilink'
  }
  if (params.hasExternalHref) {
    return params.withModifier ? 'edit-link' : 'open-external'
  }
  return 'ignore'
}

/**
 * Builds editor options with stable callback wiring.
 */
export function useEditorTiptapSetup(options: UseEditorTiptapSetupOptions): Partial<EditorOptions> {
  return {
    extensions: options.extensions,
    onUpdate: () => {
      options.onUpdate()
    },
    onSelectionUpdate: () => {
      options.onSelectionUpdate()
    },
    onTransaction: ({ transaction }) => {
      if (transaction.docChanged) {
        options.onDocChanged()
      }
    }
  }
}
