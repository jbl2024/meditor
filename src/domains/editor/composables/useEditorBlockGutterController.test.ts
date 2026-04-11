import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useEditorBlockGutterController } from './useEditorBlockGutterController'

function createSelection(nodeType: string, attrs: Record<string, unknown> = {}, text = 'Hello') {
  return {
    $from: {
      depth: 1,
      parent: {
        type: { name: nodeType },
        nodeSize: 4,
        attrs,
        textContent: text
      },
      before: () => 1
    }
  } as any
}

function createEditorHarness() {
  const blockEl = document.createElement('div')
  Object.defineProperty(blockEl, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 80, top: 120, width: 320, height: 24, right: 400, bottom: 144 })
  })

  const selection = createSelection('heading', { level: 2 }, 'Title')
  const editorDom = document.createElement('div')
  Object.defineProperty(editorDom, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 80, top: 50, width: 320, height: 600, right: 400, bottom: 650 })
  })
  const editor = {
    isFocused: true,
    state: { selection },
    view: {
      dom: editorDom,
      hasFocus: () => true,
      nodeDOM: () => blockEl
    }
  } as any

  const holder = ref(document.createElement('div'))
  holder.value.scrollTop = 18
  holder.value.scrollLeft = 4
  Object.defineProperty(holder.value, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 20, top: 50, width: 900, height: 600, right: 920, bottom: 650 })
  })

  return {
    editor,
    holder,
    titleEditorFocused: ref(false)
  }
}

describe('useEditorBlockGutterController', () => {
  it('resolves the current block target and anchor from the active selection', () => {
    const harness = createEditorHarness()
    const controller = useEditorBlockGutterController({
      getEditor: () => harness.editor,
      holder: harness.holder,
      titleEditorFocused: harness.titleEditorFocused
    })

    controller.syncSelectionTarget()

    expect(controller.target.value).toMatchObject({
      pos: 1,
      nodeType: 'heading',
      attrs: { level: 2 },
      text: 'Title'
    })
    expect(controller.anchorRect.value).toEqual({
      left: 64,
      top: 100,
      width: 320,
      height: 24
    })
    expect(controller.visible.value).toBe(true)

    harness.editor.state.selection = createSelection('paragraph', {}, 'Body')
    controller.syncSelectionTarget()
    expect(controller.target.value).toMatchObject({
      nodeType: 'paragraph',
      text: 'Body'
    })

    harness.editor.state.selection = {
      $from: {
        depth: 2,
        parent: {
          type: { name: 'paragraph' },
          nodeSize: 4,
          attrs: {},
          textContent: 'Item'
        },
        before: (depth: number) => (depth === 2 ? 3 : 1),
        node: (depth: number) => {
          if (depth === 2) {
            return {
              type: { name: 'paragraph' },
              nodeSize: 4,
              attrs: {},
              textContent: 'Item'
            }
          }
          if (depth === 1) {
            return {
              type: { name: 'bulletList' },
              nodeSize: 6,
              attrs: {},
              textContent: 'Item'
            }
          }
          return { type: { name: 'doc' } }
        }
      }
    } as any
    controller.syncSelectionTarget()
    expect(controller.target.value).toMatchObject({
      nodeType: 'bulletList',
      text: 'Item'
    })
  })

  it('anchors the toolbar to the editor left edge even for indented blocks', () => {
    const harness = createEditorHarness()

    // Simulate an indented block whose left edge is 40px right of the editor's left
    const indentedBlockEl = document.createElement('div')
    Object.defineProperty(indentedBlockEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 120, top: 120, width: 280, height: 24, right: 400, bottom: 144 })
    })
    harness.editor.view.nodeDOM = () => indentedBlockEl

    const controller = useEditorBlockGutterController({
      getEditor: () => harness.editor,
      holder: harness.holder,
      titleEditorFocused: harness.titleEditorFocused
    })

    controller.syncSelectionTarget()

    // left must use editor.view.dom.left (80), not the indented block's left (120)
    expect(controller.anchorRect.value?.left).toBe(64) // 80 - 20 + 4
  })

  it('pins a stable menu target while the live selection keeps moving', () => {
    const harness = createEditorHarness()
    const controller = useEditorBlockGutterController({
      getEditor: () => harness.editor,
      holder: harness.holder,
      titleEditorFocused: harness.titleEditorFocused
    })

    controller.syncSelectionTarget()
    controller.openMenu()

    harness.editor.state.selection = createSelection('paragraph', {}, 'Body')
    controller.syncSelectionTarget()

    expect(controller.target.value?.nodeType).toBe('paragraph')
    expect(controller.menuTarget.value?.nodeType).toBe('heading')
    expect(controller.activeTarget.value?.nodeType).toBe('heading')

    controller.closeMenu()

    expect(controller.menuTarget.value).toBeNull()
    expect(controller.activeTarget.value?.nodeType).toBe('paragraph')
  })

  it('hides on body blur or title focus, but stays visible while the menu is open', () => {
    const harness = createEditorHarness()
    const controller = useEditorBlockGutterController({
      getEditor: () => harness.editor,
      holder: harness.holder,
      titleEditorFocused: harness.titleEditorFocused
    })

    controller.syncSelectionTarget()
    expect(controller.visible.value).toBe(true)

    harness.editor.isFocused = false
    harness.editor.view.hasFocus = () => false
    controller.syncContentFocus()
    expect(controller.visible.value).toBe(false)

    harness.editor.isFocused = true
    harness.editor.view.hasFocus = () => true
    controller.syncSelectionTarget()
    controller.openMenu()
    harness.editor.isFocused = false
    harness.editor.view.hasFocus = () => false
    controller.syncContentFocus()
    expect(controller.visible.value).toBe(true)

    harness.titleEditorFocused.value = true
    expect(controller.visible.value).toBe(true)

    controller.closeMenu()
    expect(controller.visible.value).toBe(false)
  })
})
