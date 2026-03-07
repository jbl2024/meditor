import { nextTick, ref, type Ref } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import {
  clearEditorFind,
  getEditorFindState,
  setEditorFindSearch,
  stepEditorFindMatch
} from '../lib/tiptap/extensions/EditorFind'

type UseEditorFindToolbarOptions = {
  holder: Ref<HTMLElement | null>
  getEditor: () => Editor | null
}

function normalizeSelectedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function useEditorFindToolbar(options: UseEditorFindToolbarOptions) {
  const open = ref(false)
  const query = ref('')
  const caseSensitive = ref(false)
  const wholeWord = ref(false)
  const activeMatch = ref(0)
  const matchCount = ref(0)
  const inputEl = ref<HTMLInputElement | null>(null)

  function syncFromEditor() {
    const state = getEditorFindState(options.getEditor())
    query.value = state.query
    caseSensitive.value = state.caseSensitive
    wholeWord.value = state.wholeWord
    matchCount.value = state.matches.length
    activeMatch.value = state.matches.length && state.activeIndex >= 0 ? state.activeIndex + 1 : 0
  }

  function scrollActiveMatchIntoView() {
    const editor = options.getEditor()
    const holderEl = options.holder.value
    if (!editor || !holderEl) return

    const state = getEditorFindState(editor)
    const active = state.activeIndex >= 0 ? state.matches[state.activeIndex] : null
    if (!active) return

    let start: ReturnType<typeof editor.view.coordsAtPos>
    let end: ReturnType<typeof editor.view.coordsAtPos>
    try {
      start = editor.view.coordsAtPos(active.from)
      end = editor.view.coordsAtPos(active.to)
    } catch {
      return
    }
    const holderRect = holderEl.getBoundingClientRect()
    const currentTop = holderEl.scrollTop
    const matchTop = Math.min(start.top, end.top) - holderRect.top + currentTop
    const matchBottom = Math.max(start.bottom, end.bottom) - holderRect.top + currentTop
    const viewportTop = currentTop + 56
    const viewportBottom = currentTop + holderEl.clientHeight - 96

    if (matchTop < viewportTop) {
      holderEl.scrollTo({ top: Math.max(0, matchTop - 72), behavior: 'smooth' })
      return
    }

    if (matchBottom > viewportBottom) {
      holderEl.scrollTo({ top: Math.max(0, matchBottom - holderEl.clientHeight + 112), behavior: 'smooth' })
    }
  }

  function applySearch(payload?: {
    query?: string
    caseSensitive?: boolean
    wholeWord?: boolean
    activeIndex?: number
  }) {
    setEditorFindSearch(options.getEditor(), {
      query: payload?.query ?? query.value,
      caseSensitive: payload?.caseSensitive ?? caseSensitive.value,
      wholeWord: payload?.wholeWord ?? wholeWord.value,
      activeIndex: payload?.activeIndex ?? 0
    })
    syncFromEditor()
    scrollActiveMatchIntoView()
  }

  function focusInput() {
    void nextTick(() => {
      inputEl.value?.focus()
      inputEl.value?.select()
    })
  }

  function openToolbar() {
    open.value = true
    syncFromEditor()

    if (!query.value) {
      const editor = options.getEditor()
      const selection = editor?.state.selection
      if (editor && selection && !selection.empty) {
        const selectedText = normalizeSelectedText(editor.state.doc.textBetween(selection.from, selection.to, ' ', ' '))
        if (selectedText) {
          query.value = selectedText
          applySearch({ query: selectedText, activeIndex: 0 })
        }
      }
    } else {
      scrollActiveMatchIntoView()
    }

    focusInput()
  }

  function closeToolbar(optionsOverride?: { focusEditor?: boolean }) {
    open.value = false
    clearEditorFind(options.getEditor())
    syncFromEditor()
    if (optionsOverride?.focusEditor) {
      options.getEditor()?.commands.focus()
    }
  }

  function onQueryInput(value: string) {
    query.value = value
    applySearch({ query: value, activeIndex: 0 })
  }

  function onCaseSensitiveToggle() {
    caseSensitive.value = !caseSensitive.value
    applySearch({ caseSensitive: caseSensitive.value, activeIndex: 0 })
    focusInput()
  }

  function onWholeWordToggle() {
    wholeWord.value = !wholeWord.value
    applySearch({ wholeWord: wholeWord.value, activeIndex: 0 })
    focusInput()
  }

  function nextMatch() {
    stepEditorFindMatch(options.getEditor(), 1)
    syncFromEditor()
    scrollActiveMatchIntoView()
  }

  function prevMatch() {
    stepEditorFindMatch(options.getEditor(), -1)
    syncFromEditor()
    scrollActiveMatchIntoView()
  }

  return {
    open,
    query,
    caseSensitive,
    wholeWord,
    activeMatch,
    matchCount,
    inputEl,
    syncFromEditor,
    openToolbar,
    closeToolbar,
    onQueryInput,
    onCaseSensitiveToggle,
    onWholeWordToggle,
    nextMatch,
    prevMatch
  }
}
