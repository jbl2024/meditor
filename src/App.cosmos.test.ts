import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  getWikilinkGraph: vi.fn(async () => ({ nodes: [], edges: [], generated_at_ms: Date.now() }))
}))

vi.mock('./lib/api', () => ({
  selectWorkingFolder: vi.fn(async () => null),
  clearWorkingFolder: vi.fn(async () => {}),
  setWorkingFolder: vi.fn(async (path: string) => path),
  listChildren: vi.fn(async () => []),
  listMarkdownFiles: vi.fn(async () => []),
  pathExists: vi.fn(async () => false),
  readTextFile: vi.fn(async () => ''),
  readFileMetadata: vi.fn(async () => ({ created_at_ms: null, updated_at_ms: null })),
  writeTextFile: vi.fn(async () => {}),
  reindexMarkdownFile: vi.fn(async () => {}),
  createEntry: vi.fn(async (parent: string, name: string) => `${parent}/${name}`),
  renameEntry: vi.fn(async (path: string, name: string) => path.replace(/[^/]+$/, name)),
  duplicateEntry: vi.fn(async (path: string) => `${path}.copy`),
  copyEntry: vi.fn(async (source: string) => source),
  moveEntry: vi.fn(async (source: string) => source),
  trashEntry: vi.fn(async (path: string) => path),
  openPathExternal: vi.fn(async () => {}),
  openExternalUrl: vi.fn(async () => {}),
  revealInFileManager: vi.fn(async () => {}),
  initDb: vi.fn(async () => {}),
  ftsSearch: vi.fn(async () => []),
  backlinksForPath: vi.fn(async () => []),
  updateWikilinksForRename: vi.fn(async () => ({ updated_files: 0 })),
  rebuildWorkspaceIndex: vi.fn(async () => ({ indexed_files: 0 })),
  readPropertyTypeSchema: vi.fn(async () => ({})),
  writePropertyTypeSchema: vi.fn(async () => {}),
  listenWorkspaceFsChanged: vi.fn(async () => () => {}),
  getWikilinkGraph: hoisted.getWikilinkGraph
}))

vi.mock('./components/EditorView.vue', () => ({
  default: defineComponent({
    name: 'EditorViewStub',
    setup(_, { expose }) {
      expose({
        saveNow: async () => {},
        reloadCurrent: async () => {},
        focusEditor: () => {},
        focusFirstContentBlock: async () => {},
        revealSnippet: async () => {},
        revealOutlineHeading: async () => {},
        revealAnchor: async () => true,
        zoomIn: () => 1,
        zoomOut: () => 1,
        resetZoom: () => 1,
        getZoom: () => 1
      })
      return () => h('div', { 'data-editor-stub': 'true' }, 'editor')
    }
  })
}))

vi.mock('./components/EditorRightPane.vue', () => ({
  default: defineComponent({
    name: 'EditorRightPaneStub',
    setup() {
      return () => h('div', { 'data-right-pane-stub': 'true' }, 'right-pane')
    }
  })
}))

vi.mock('./components/explorer/ExplorerTree.vue', () => ({
  default: defineComponent({
    name: 'ExplorerTreeStub',
    setup() {
      return () => h('div', { 'data-explorer-stub': 'true' }, 'explorer')
    }
  })
}))

vi.mock('./components/cosmos/CosmosView.vue', () => ({
  default: defineComponent({
    name: 'CosmosViewStub',
    emits: ['open-node'],
    setup(_, { emit }) {
      return () =>
        h('div', { 'data-cosmos-stub': 'true' }, [
          h(
            'button',
            {
              type: 'button',
              'data-cosmos-open': 'true',
              onClick: () => emit('open-node', '/vault/opened-from-cosmos.md')
            },
            'open-node'
          )
        ])
    }
  })
}))

import App from './App.vue'

async function flushUi() {
  await nextTick()
  await Promise.resolve()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function mountApp() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = () => {}
  }
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(App)
  app.mount(root)
  return { app, root }
}

describe('App cosmos integration', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('toggles cosmos view from activity bar', async () => {
    const mounted = mountApp()
    await flushUi()

    const cosmosBtn = mounted.root.querySelector<HTMLButtonElement>('button[aria-label="Cosmos view"]')
    cosmosBtn?.click()
    await flushUi()
    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('cosmos')

    cosmosBtn?.click()
    await flushUi()
    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('explorer')

    mounted.app.unmount()
  })

  it('exits cosmos on Escape and returns to previous view', async () => {
    const mounted = mountApp()
    await flushUi()

    mounted.root.querySelector<HTMLButtonElement>('button[aria-label="Search"]')?.click()
    await flushUi()
    mounted.root.querySelector<HTMLButtonElement>('button[aria-label="Cosmos view"]')?.click()
    await flushUi()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushUi()

    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('search')

    mounted.app.unmount()
  })

  it('restores mode from session storage', async () => {
    window.sessionStorage.setItem('meditor:view:active', 'cosmos')
    window.sessionStorage.setItem('meditor:view:last-non-cosmos', 'search')

    const mounted = mountApp()
    await flushUi()

    expect(mounted.root.querySelector('[data-cosmos-stub="true"]')).toBeTruthy()

    mounted.root.querySelector<HTMLButtonElement>('button[aria-label="Cosmos view"]')?.click()
    await flushUi()

    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('search')

    mounted.app.unmount()
  })

  it('opens node target and returns to editor when cosmos emits open-node', async () => {
    const mounted = mountApp()
    await flushUi()

    mounted.root.querySelector<HTMLButtonElement>('button[aria-label="Cosmos view"]')?.click()
    await flushUi()

    mounted.root.querySelector<HTMLButtonElement>('button[data-cosmos-open="true"]')?.click()
    await flushUi()

    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('explorer')
    expect((mounted.root.textContent ?? '').toLowerCase()).toContain('opened-from-cosmos.md')

    mounted.app.unmount()
  })
})
