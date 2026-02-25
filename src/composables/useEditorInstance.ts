import type EditorJS from '@editorjs/editorjs'
import type { Ref } from 'vue'

type EditorDomListener = {
  type: keyof HTMLElementEventMap
  handler: EventListener
  useCapture?: boolean
}

/**
 * Dependencies required by {@link useEditorInstance}.
 */
export type UseEditorInstanceOptions = {
  holder: Ref<HTMLElement | null>
  getEditor: () => EditorJS | null
  setEditor: (editor: EditorJS | null) => void
  createEditor: (holder: HTMLElement, onEditorChange: () => Promise<void>) => EditorJS
  onEditorChange: () => Promise<void>
  listeners: EditorDomListener[]
  startObservers: () => void
  stopObservers: () => void
  beforeDestroy?: () => void
}

/**
 * useEditorInstance
 *
 * Purpose:
 * - Own EditorJS instance lifecycle and DOM listener wiring.
 *
 * Responsibilities:
 * - Lazily create and initialize a single EditorJS instance.
 * - Attach/remove capture listeners symmetrically around instance lifetime.
 * - Start/stop observer side-effects aligned with instance presence.
 *
 * Invariants:
 * - `ensureEditor` is idempotent while an instance exists.
 * - `destroyEditor` is safe to call even when no instance exists.
 */
export function useEditorInstance(options: UseEditorInstanceOptions) {
  async function ensureEditor() {
    if (!options.holder.value || options.getEditor()) return

    const instance = options.createEditor(options.holder.value, options.onEditorChange)
    options.setEditor(instance)

    await instance.isReady
    for (const listener of options.listeners) {
      options.holder.value.addEventListener(listener.type, listener.handler, Boolean(listener.useCapture))
    }
    options.startObservers()
  }

  async function destroyEditor() {
    options.beforeDestroy?.()

    if (options.holder.value) {
      for (const listener of options.listeners) {
        options.holder.value.removeEventListener(listener.type, listener.handler, Boolean(listener.useCapture))
      }
    }
    options.stopObservers()

    const instance = options.getEditor()
    if (!instance) return
    await instance.destroy()
    options.setEditor(null)
  }

  return {
    ensureEditor,
    destroyEditor
  }
}
