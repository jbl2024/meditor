import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./EditorSlashMenu.vue', () => ({
  default: defineComponent({
    emits: ['update:index', 'select'],
    setup(_, { emit }) {
      return () => h('button', { class: 'slash-stub', onClick: () => { emit('update:index', 2); emit('select', { id: 'quote', label: 'Quote', type: 'quote', data: {} }) } }, 'slash')
    }
  })
}))

vi.mock('./EditorWikilinkMenu.vue', () => ({
  default: defineComponent({
    emits: ['update:index', 'select'],
    setup(_, { emit }) {
      return () => h('button', { class: 'wikilink-stub', onClick: () => { emit('update:index', 1); emit('select', 'foo') } }, 'wikilink')
    }
  })
}))

vi.mock('./EditorBlockMenu.vue', () => ({
  default: defineComponent({
    emits: ['menu-el', 'update:index', 'select', 'close'],
    setup(_, { emit }) {
      return () => h('button', { class: 'block-stub', onClick: () => { emit('menu-el', null); emit('update:index', 3); emit('select', { id: 'delete', actionId: 'delete', label: 'Delete' }); emit('close') } }, 'block')
    }
  })
}))

vi.mock('./EditorTableToolbar.vue', () => ({
  default: defineComponent({
    emits: ['menu-el', 'select', 'close'],
    setup(_, { emit }) {
      return () => h('button', { class: 'table-stub', onClick: () => { emit('menu-el', null); emit('select', 'add_row_after'); emit('close') } }, 'table')
    }
  })
}))

import EditorFloatingOverlays from './EditorFloatingOverlays.vue'

describe('EditorFloatingOverlays', () => {
  it('forwards child events through namespaced emits', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const handlers = {
      slashUpdateIndex: vi.fn(),
      slashSelect: vi.fn(),
      wikilinkUpdateIndex: vi.fn(),
      wikilinkSelect: vi.fn(),
      blockUpdateIndex: vi.fn(),
      blockSelect: vi.fn(),
      blockClose: vi.fn(),
      blockMenuEl: vi.fn(),
      tableSelect: vi.fn(),
      tableClose: vi.fn(),
      tableMenuEl: vi.fn()
    }

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorFloatingOverlays, {
            slashOpen: true,
            slashIndex: 0,
            slashLeft: 10,
            slashTop: 10,
            slashCommands: [],
            wikilinkOpen: true,
            wikilinkIndex: 0,
            wikilinkLeft: 20,
            wikilinkTop: 20,
            wikilinkResults: [],
            blockMenuOpen: true,
            blockMenuIndex: 0,
            blockMenuX: 30,
            blockMenuY: 30,
            blockMenuActions: [],
            blockMenuConvertActions: [],
            tableToolbarOpen: true,
            tableToolbarViewportLeft: 40,
            tableToolbarViewportTop: 40,
            tableToolbarActions: [],
            tableMarkdownMode: true,
            tableToolbarViewportMaxHeight: 320,
            'onSlash:updateIndex': handlers.slashUpdateIndex,
            'onSlash:select': handlers.slashSelect,
            'onWikilink:updateIndex': handlers.wikilinkUpdateIndex,
            'onWikilink:select': handlers.wikilinkSelect,
            'onBlock:updateIndex': handlers.blockUpdateIndex,
            'onBlock:select': handlers.blockSelect,
            'onBlock:close': handlers.blockClose,
            'onBlock:menuEl': handlers.blockMenuEl,
            'onTable:select': handlers.tableSelect,
            'onTable:close': handlers.tableClose,
            'onTable:menuEl': handlers.tableMenuEl
          })
      }
    }))

    app.mount(root)

    const slash = document.body.querySelector('.slash-stub') as HTMLButtonElement
    const wikilink = document.body.querySelector('.wikilink-stub') as HTMLButtonElement
    const block = document.body.querySelector('.block-stub') as HTMLButtonElement
    const table = document.body.querySelector('.table-stub') as HTMLButtonElement

    slash.click()
    wikilink.click()
    block.click()
    table.click()

    expect(handlers.slashUpdateIndex).toHaveBeenCalledWith(2)
    expect(handlers.slashSelect).toHaveBeenCalled()
    expect(handlers.wikilinkUpdateIndex).toHaveBeenCalledWith(1)
    expect(handlers.wikilinkSelect).toHaveBeenCalledWith('foo')
    expect(handlers.blockUpdateIndex).toHaveBeenCalledWith(3)
    expect(handlers.blockSelect).toHaveBeenCalled()
    expect(handlers.blockClose).toHaveBeenCalledTimes(1)
    expect(handlers.tableSelect).toHaveBeenCalledWith('add_row_after')
    expect(handlers.tableClose).toHaveBeenCalledTimes(1)

    app.unmount()
    document.body.innerHTML = ''
  })
})
