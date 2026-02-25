<script setup lang="ts">
/**
 * EditorView
 *
 * Purpose:
 * - Orchestrates the note editing experience around an EditorJS instance.
 *
 * Responsibilities:
 * - Wire editor lifecycle (mount, destroy, load, save, autosave triggers).
 * - Coordinate domain behaviors (wikilinks, shortcuts, code-block UI, outline).
 * - Bind UI sections (properties panel, slash menu, wikilink menu, load overlay).
 *
 * Boundaries:
 * - Business/state behaviors are delegated to composables where possible.
 * - This component remains the integration layer between EditorJS, UI events, and app APIs.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EditorJS, { type OutputBlockData } from '@editorjs/editorjs'
import {
  editorDataToMarkdown,
  markdownToEditorData,
  sanitizeExternalHref,
  type EditorBlock
} from '../lib/markdownBlocks'
import { EDITOR_SLASH_COMMANDS } from '../lib/editorSlashCommands'
import { createEditorTools } from '../lib/editorTools'
import { openExternalUrl } from '../lib/api'
import EditorPropertiesPanel from './editor/EditorPropertiesPanel.vue'
import EditorSlashMenu from './editor/EditorSlashMenu.vue'
import EditorWikilinkMenu from './editor/EditorWikilinkMenu.vue'
import EditorLargeDocOverlay from './editor/EditorLargeDocOverlay.vue'
import EditorMermaidReplaceDialog from './editor/EditorMermaidReplaceDialog.vue'
import { composeMarkdownDocument, serializeFrontmatter } from '../lib/frontmatter'
import { useEditorPersistence } from '../composables/useEditorPersistence'
import { useFrontmatterProperties } from '../composables/useFrontmatterProperties'
import { useCodeBlockUi } from '../composables/useCodeBlockUi'
import { useWikilinkBehavior } from '../composables/useWikilinkBehavior'
import { useEditorInteraction } from '../composables/useEditorInteraction'
import { useEditorDocumentLifecycle } from '../composables/useEditorDocumentLifecycle'
import { useEditorSaveLifecycle } from '../composables/useEditorSaveLifecycle'
import { useVirtualTitleBehavior } from '../composables/useVirtualTitleBehavior'
import { useEditorCaret, type EditorCaretSnapshot } from '../composables/useEditorCaret'
import { useEditorOutlineNavigation } from '../composables/useEditorOutlineNavigation'
import { useEditorZoom } from '../composables/useEditorZoom'
import { useEditorInstance } from '../composables/useEditorInstance'
import { useEditorBlocks } from '../composables/useEditorBlocks'
import { useMermaidReplaceDialog } from '../composables/useMermaidReplaceDialog'
import {
  normalizeBlockId,
  normalizeHeadingAnchor,
  slugifyHeading
} from '../lib/wikilinks'

const VIRTUAL_TITLE_BLOCK_ID = '__virtual_title__'
type CorePropertyOption = {
  key: string
  label?: string
  description?: string
}
const CORE_PROPERTY_OPTIONS: CorePropertyOption[] = [
  { key: 'tags', label: 'tags', description: 'Tag list' },
  { key: 'aliases', label: 'aliases', description: 'Alternative names' },
  { key: 'cssclasses', label: 'cssclasses', description: 'Note CSS classes' },
  { key: 'date', label: 'date', description: 'Primary date (YYYY-MM-DD)' },
  { key: 'deadline', label: 'deadline', description: 'Due date (YYYY-MM-DD)' },
  { key: 'archive', label: 'archive', description: 'Archive flag' },
  { key: 'published', label: 'published', description: 'Publish flag' }
]

type HeadingNode = {
  level: 1 | 2 | 3
  text: string
}
const SLASH_COMMANDS = EDITOR_SLASH_COMMANDS

const props = defineProps<{
  path: string
  openFile: (path: string) => Promise<string>
  saveFile: (path: string, text: string, options: { explicit: boolean }) => Promise<{ persisted: boolean }>
  renameFileFromTitle: (path: string, title: string) => Promise<{ path: string; title: string }>
  loadLinkTargets: () => Promise<string[]>
  loadLinkHeadings: (target: string) => Promise<string[]>
  loadPropertyTypeSchema: () => Promise<Record<string, string>>
  savePropertyTypeSchema: (schema: Record<string, string>) => Promise<void>
  openLinkTarget: (target: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  status: [payload: { path: string; dirty: boolean; saving: boolean; saveError: string }]
  'path-renamed': [payload: { from: string; to: string; manual: boolean }]
  outline: [payload: HeadingNode[]]
  properties: [payload: { path: string; items: Array<{ key: string; value: string }>; parseErrorCount: number }]
}>()

const holder = ref<HTMLDivElement | null>(null)
let editor: EditorJS | null = null
let suppressOnChange = false

const slashOpen = ref(false)
const slashIndex = ref(0)
const slashLeft = ref(0)
const slashTop = ref(0)

const currentPath = computed(() => props.path?.trim() || '')
const isMacOs = typeof navigator !== 'undefined' && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent)
const { editorZoomStyle, initFromStorage: initEditorZoomFromStorage, zoomBy: zoomEditorBy, resetZoom: resetEditorZoom, getZoom } = useEditorZoom()
const {
  parseOutlineFromDom,
  revealAnchor,
  revealOutlineHeading,
  emitOutlineSoon,
  clearOutlineTimer,
  revealSnippet
} = useEditorOutlineNavigation({
  holder,
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  emitOutline: (headings) => emit('outline', headings),
  normalizeHeadingAnchor,
  slugifyHeading,
  normalizeBlockId,
  nextUiTick: nextTick
})
const {
  noteTitleFromPath,
  blockTextCandidate,
  stripVirtualTitle,
  readVirtualTitle,
  withVirtualTitle,
  isEditingVirtualTitle,
  scheduleVirtualTitleLock,
  clearVirtualTitleLock
} = useVirtualTitleBehavior({
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  holder,
  currentPath,
  hasActiveEditor: () => Boolean(editor),
  isSuppressOnChange: () => suppressOnChange,
  saveEditorData: async () => {
    if (!editor) return { blocks: [] as OutputBlockData[] }
    const data = await editor.save()
    return { blocks: (data.blocks ?? []) as OutputBlockData[] }
  },
  renderBlocks
})
const {
  loadedTextByPath,
  dirtyByPath,
  scrollTopByPath,
  caretByPath,
  savingByPath,
  setDirty,
  setSaving,
  setSaveError,
  clearAutosaveTimer,
  scheduleAutosave,
  movePathState: movePersistencePathState
} = useEditorPersistence<EditorCaretSnapshot>({
  emitStatus: (payload) => emit('status', payload),
  isEditingVirtualTitle,
  saveCurrentFile
})
const { captureCaret, restoreCaret } = useEditorCaret({
  holder,
  caretByPath
})
const {
  propertyEditorMode,
  frontmatterByPath,
  rawYamlByPath,
  activeParseErrors,
  activeRawYaml,
  canUseStructuredProperties,
  structuredPropertyFields,
  structuredPropertyKeys,
  ensurePropertySchemaLoaded,
  resetPropertySchemaState,
  parseAndStoreFrontmatter,
  serializableFrontmatterFields,
  addPropertyField,
  removePropertyField,
  onPropertyTypeChange,
  onPropertyKeyInput,
  onPropertyValueInput,
  onPropertyCheckboxInput,
  onPropertyTokensChange,
  effectiveTypeForField,
  isPropertyTypeLocked,
  propertiesExpanded,
  togglePropertiesVisibility,
  onRawYamlInput,
  movePathState: moveFrontmatterPathState
} = useFrontmatterProperties({
  currentPath,
  loadPropertyTypeSchema: props.loadPropertyTypeSchema,
  savePropertyTypeSchema: props.savePropertyTypeSchema,
  onDirty: (path) => {
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
  },
  emitProperties: (payload) => emit('properties', payload)
})
const {
  initFromStorage: initCodeUiFromStorage,
  ensureCodeBlockUi,
  startObservers: startCodeUiObservers,
  stopObservers: stopCodeUiObservers
} = useCodeBlockUi({ holder })
const {
  wikilinkOpen,
  wikilinkIndex,
  wikilinkLeft,
  wikilinkTop,
  wikilinkResults,
  closeWikilinkMenu,
  applyWikilinkSelection,
  applyWikilinkDraftSelection,
  expandAdjacentLinkForEditing,
  collapseExpandedLinkIfCaretOutside,
  consumeSuppressCollapseOnArrowKeyup,
  collapseClosedLinkNearCaret,
  shouldSyncWikilinkFromSelection,
  isWikilinkRelevantKey,
  syncWikilinkMenuFromCaret,
  readWikilinkTargetFromAnchor,
  openLinkTargetWithAutosave,
  isDateLinkModifierPressed,
  openLinkedTokenAtCaret,
  setMenuElement: setWikilinkMenuElement
} = useWikilinkBehavior({
  holder,
  currentPath,
  dirtyByPath,
  isMacOs,
  loadLinkTargets: props.loadLinkTargets,
  loadLinkHeadings: props.loadLinkHeadings,
  openLinkTarget: props.openLinkTarget,
  saveCurrentFile,
  clearAutosaveTimer,
  setDirty,
  setSaveError,
  scheduleAutosave,
  parseOutlineFromDom
})
const { mermaidReplaceDialog, resolveMermaidReplaceDialog, requestMermaidReplaceConfirm } = useMermaidReplaceDialog()

async function renderBlocks(blocks: OutputBlockData[]) {
  if (!editor) return
  const rememberedScroll = holder.value?.scrollTop ?? 0
  suppressOnChange = true
  try {
    await editor.render({
      time: Date.now(),
      version: '2.0.0',
      blocks
    })
  } finally {
    suppressOnChange = false
  }
  await nextTick()
  if (holder.value) {
    holder.value.scrollTop = rememberedScroll
  }
}

function closeSlashMenu() {
  slashOpen.value = false
  slashIndex.value = 0
}

const {
  getCurrentBlock,
  getCurrentBlockText,
  isCurrentBlockEmpty,
  replaceCurrentBlock,
  insertParsedMarkdownBlocks,
  focusFirstContentBlock,
  focusEditor
} = useEditorBlocks({
  holder,
  getEditor: () => editor,
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  setSuppressOnChange: (value) => {
    suppressOnChange = value
  },
  nextUiTick: nextTick
})

const { onEditorKeydown, onEditorKeyup, onEditorClick, onEditorContextMenu, onEditorPaste } = useEditorInteraction({
  getEditor: () => editor,
  currentPath,
  wikilinkOpen,
  wikilinkIndex,
  wikilinkResults,
  slashOpen,
  slashIndex,
  slashCommands: SLASH_COMMANDS,
  virtualTitleBlockId: VIRTUAL_TITLE_BLOCK_ID,
  getCurrentBlock,
  getCurrentBlockText,
  isCurrentBlockEmpty,
  replaceCurrentBlock,
  insertParsedMarkdownBlocks,
  closeSlashMenu,
  closeWikilinkMenu,
  applyWikilinkSelection,
  applyWikilinkDraftSelection,
  expandAdjacentLinkForEditing,
  consumeSuppressCollapseOnArrowKeyup,
  collapseExpandedLinkIfCaretOutside,
  collapseClosedLinkNearCaret,
  shouldSyncWikilinkFromSelection,
  isWikilinkRelevantKey,
  syncWikilinkMenuFromCaret,
  readWikilinkTargetFromAnchor,
  openLinkTargetWithAutosave,
  isDateLinkModifierPressed,
  openLinkedTokenAtCaret,
  zoomEditorBy,
  resetEditorZoom,
  sanitizeExternalHref,
  openExternalUrl,
  markdownToEditorData,
  captureCaret
})

const { ensureEditor, destroyEditor } = useEditorInstance({
  holder,
  getEditor: () => editor,
  setEditor: (instance) => {
    editor = instance
  },
  createEditor: (holderElement, onEditorChange) => new EditorJS({
    holder: holderElement,
    autofocus: false,
    defaultBlock: 'paragraph',
    inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
    placeholder: 'Write here...',
    tools: createEditorTools(requestMermaidReplaceConfirm),
    onChange: onEditorChange
  }),
  onEditorChange: async () => {
    const path = currentPath.value
    if (suppressOnChange || !path) return
    setDirty(path, true)
    setSaveError(path, '')
    scheduleAutosave()
    scheduleVirtualTitleLock()
    emitOutlineSoon()
  },
  listeners: [
    { type: 'keydown', handler: onEditorKeydown as EventListener, useCapture: true },
    { type: 'keyup', handler: onEditorKeyup as EventListener, useCapture: true },
    { type: 'click', handler: onEditorClick as EventListener, useCapture: true },
    { type: 'contextmenu', handler: onEditorContextMenu as EventListener, useCapture: true },
    { type: 'paste', handler: onEditorPaste as EventListener, useCapture: true }
  ],
  startObservers: startCodeUiObservers,
  stopObservers: stopCodeUiObservers,
  beforeDestroy: () => {
    clearAutosaveTimer()
    clearVirtualTitleLock()
    closeSlashMenu()
    closeWikilinkMenu()
  }
})

const {
  isLoadingLargeDocument,
  loadStageLabel,
  loadProgressPercent,
  loadProgressIndeterminate,
  loadDocumentStats,
  loadCurrentFile
} = useEditorDocumentLifecycle({
  ensureEditor,
  ensurePropertySchemaLoaded,
  hasActiveEditor: () => Boolean(editor),
  clearAutosaveTimer,
  closeSlashMenu,
  closeWikilinkMenu,
  setSaveError,
  openFile: props.openFile,
  parseAndStoreFrontmatter,
  resolveEditorBody: (path, rawMarkdown) => frontmatterByPath.value[path]?.body ?? rawMarkdown,
  markdownToEditorData,
  normalizeLoadedBlocks: (blocks, path) => withVirtualTitle(blocks, noteTitleFromPath(path)).blocks,
  setLoadedText: (path, markdown) => {
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: markdown
    }
  },
  setSuppressOnChange: (value) => {
    suppressOnChange = value
  },
  renderEditor: async ({ version, blocks }) => {
    if (!editor) return
    await editor.render({
      time: Date.now(),
      version,
      blocks
    })
  },
  setDirty,
  ensureCodeBlockUi,
  nextUiTick: nextTick,
  getRememberedScrollTop: (path) => scrollTopByPath.value[path],
  setEditorScrollTop: (value) => {
    if (holder.value) {
      holder.value.scrollTop = value
    }
  },
  restoreCaret,
  focusFirstContentBlock,
  emitOutlineSoon,
  flushUiFrame: async () => {
    await nextTick()
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }
})

const saveLifecycle = useEditorSaveLifecycle({
  getCurrentPath: () => currentPath.value,
  hasActiveEditor: () => Boolean(editor),
  isSavingPath: (path) => Boolean(savingByPath.value[path]),
  setSaving,
  setSaveError,
  setDirty,
  saveEditorData: async () => {
    if (!editor) return { blocks: [] as OutputBlockData[] }
    const data = await editor.save()
    return { blocks: (data.blocks ?? []) as OutputBlockData[] }
  },
  resolveRequestedTitle: (blocks, initialPath) => readVirtualTitle(blocks) || blockTextCandidate(blocks[0]) || noteTitleFromPath(initialPath),
  getLoadedText: (path) => loadedTextByPath.value[path] ?? '',
  openFile: props.openFile,
  renameFileFromTitle: props.renameFileFromTitle,
  normalizeBlocksForTitle: withVirtualTitle,
  stripVirtualTitle,
  editorBlocksToMarkdown: (blocks) => editorDataToMarkdown({ blocks: blocks as unknown as EditorBlock[] }),
  resolveFrontmatterYaml: (savePath, initialPath) => {
    const frontmatterState = frontmatterByPath.value[savePath] ?? frontmatterByPath.value[initialPath]
    if (propertyEditorMode.value === 'raw') {
      return rawYamlByPath.value[savePath] ?? rawYamlByPath.value[initialPath] ?? ''
    }
    return serializeFrontmatter(serializableFrontmatterFields(frontmatterState?.fields ?? []))
  },
  composeMarkdownDocument,
  movePersistencePathState,
  moveFrontmatterPathState,
  emitPathRenamed: (payload) => emit('path-renamed', payload),
  renderBlocks,
  saveFile: props.saveFile,
  setLoadedText: (path, markdown) => {
    loadedTextByPath.value = {
      ...loadedTextByPath.value,
      [path]: markdown
    }
  },
  deleteLoadedText: (path) => {
    if (!(path in loadedTextByPath.value)) return
    const nextLoaded = { ...loadedTextByPath.value }
    delete nextLoaded[path]
    loadedTextByPath.value = nextLoaded
  },
  parseAndStoreFrontmatter,
  emitOutlineSoon
})

async function saveCurrentFile(manual = true) {
  await saveLifecycle.saveCurrentFile(manual)
}

watch(
  () => props.path,
  async (next, prev) => {
    if (prev && holder.value) {
      captureCaret(prev)
      scrollTopByPath.value = {
        ...scrollTopByPath.value,
        [prev]: holder.value.scrollTop
      }
    }

    const nextPath = next?.trim()
    if (!nextPath) {
      resetPropertySchemaState()
      emit('properties', { path: '', items: [], parseErrorCount: 0 })
      await destroyEditor()
      emit('outline', [])
      return
    }

    await nextTick()
    await ensureEditor()
    if (!editor) return
    await loadCurrentFile(nextPath)
  }
)

onMounted(async () => {
  initCodeUiFromStorage()
  initEditorZoomFromStorage()

  if (currentPath.value) {
    await ensureEditor()
    await loadCurrentFile(currentPath.value)
  }
})

onBeforeUnmount(async () => {
  clearOutlineTimer()
  clearVirtualTitleLock()
  if (mermaidReplaceDialog.value.resolve) {
    mermaidReplaceDialog.value.resolve(false)
  }
  await destroyEditor()
})

defineExpose({
  saveNow: async () => {
    await saveCurrentFile(true)
  },
  reloadCurrent: async () => {
    if (!currentPath.value) return
    await loadCurrentFile(currentPath.value)
  },
  focusEditor,
  focusFirstContentBlock,
  revealSnippet,
  revealOutlineHeading,
  revealAnchor,
  zoomIn: () => {
    return zoomEditorBy(0.1)
  },
  zoomOut: () => {
    return zoomEditorBy(-0.1)
  },
  resetZoom: () => {
    return resetEditorZoom()
  },
  getZoom
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="!path"
      class="flex min-h-0 flex-1 items-center justify-center bg-white px-8 py-6 text-sm text-slate-500 dark:bg-slate-950 dark:text-slate-400"
    >
      Open a file to start editing
    </div>

    <div v-else class="editor-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
      <EditorPropertiesPanel
        :expanded="propertiesExpanded(path)"
        :mode="propertyEditorMode"
        :can-use-structured-properties="canUseStructuredProperties"
        :structured-property-fields="structuredPropertyFields"
        :structured-property-keys="structuredPropertyKeys"
        :active-raw-yaml="activeRawYaml"
        :active-parse-errors="activeParseErrors"
        :core-property-options="CORE_PROPERTY_OPTIONS"
        :effective-type-for-field="effectiveTypeForField"
        :is-property-type-locked="isPropertyTypeLocked"
        @toggle-visibility="togglePropertiesVisibility"
        @set-mode="propertyEditorMode = $event"
        @property-key-input="void onPropertyKeyInput($event.index, $event.value)"
        @property-type-change="void onPropertyTypeChange($event.index, $event.value)"
        @property-value-input="onPropertyValueInput($event.index, $event.value)"
        @property-checkbox-input="onPropertyCheckboxInput($event.index, $event.checked)"
        @property-tokens-change="onPropertyTokensChange($event.index, $event.tokens)"
        @remove-property="removePropertyField($event)"
        @add-property="addPropertyField($event)"
        @raw-yaml-input="onRawYamlInput($event)"
      />

      <div class="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref="holder"
          class="editor-holder relative h-full min-h-0 overflow-y-auto px-8 py-6"
          :style="editorZoomStyle"
          @click="closeSlashMenu(); closeWikilinkMenu()"
        >
          <EditorSlashMenu
            :open="slashOpen"
            :index="slashIndex"
            :left="slashLeft"
            :top="slashTop"
            :commands="SLASH_COMMANDS"
            @update:index="slashIndex = $event"
            @select="closeSlashMenu(); replaceCurrentBlock($event.type, $event.data)"
          />

          <EditorWikilinkMenu
            :open="wikilinkOpen"
            :index="wikilinkIndex"
            :left="wikilinkLeft"
            :top="wikilinkTop"
            :results="wikilinkResults"
            @menu-el="setWikilinkMenuElement($event)"
            @update:index="wikilinkIndex = $event"
            @select="applyWikilinkSelection($event)"
          />
        </div>
        <EditorLargeDocOverlay
          :visible="isLoadingLargeDocument"
          :stage-label="loadStageLabel"
          :progress-percent="loadProgressPercent"
          :progress-indeterminate="loadProgressIndeterminate"
          :stats="loadDocumentStats"
        />
      </div>
    </div>

    <EditorMermaidReplaceDialog
      :visible="mermaidReplaceDialog.visible"
      :template-label="mermaidReplaceDialog.templateLabel"
      @cancel="resolveMermaidReplaceDialog(false)"
      @confirm="resolveMermaidReplaceDialog(true)"
    />

  </div>
</template>

<style scoped>
.editor-holder {
  --meditor-link-color: #2563eb;
}

.dark .editor-holder {
  --meditor-link-color: #60a5fa;
}

.editor-holder :deep(a.md-wikilink) {
  color: var(--meditor-link-color);
  text-decoration: underline;
}

.dark .editor-holder :deep(a.md-wikilink) {
  color: var(--meditor-link-color);
}

</style>
