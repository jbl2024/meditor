import { createApp, defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import EditorAtMenu from './EditorAtMenu.vue'
import type { EditorAtMacroEntry } from '../../lib/editorAtMacros'

describe('EditorAtMenu', () => {
  it('keeps long replacement values truncated in the row and exposes the full value as a title', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const items = [
      {
        id: 'path',
        label: 'Path',
        group: 'Document',
        kind: 'insert_text',
        description: 'Insert the current note path',
        replacement: '/Users/jbl2024/Documents/tomosona/test/paste/very-long-path-note.md',
        preview: '/Users/jbl2024/Documents/tomosona/test/paste/very-long-path-note.md',
        aliases: ['path']
      }
    ] satisfies EditorAtMacroEntry[]

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorAtMenu, {
            open: true,
            index: 0,
            left: 0,
            top: 0,
            query: '',
            items
          })
      }
    }))

    app.mount(root)

    const replacement = root.querySelector('.editor-at-item__replacement') as HTMLElement | null
    expect(replacement).toBeTruthy()
    expect(replacement?.getAttribute('title')).toBe(items[0].replacement)

    app.unmount()
    document.body.innerHTML = ''
  })

  it('renders a compact macro kind label without exposing the group as row text', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const items = [
      {
        id: 'today',
        label: 'Today',
        group: 'Time',
        kind: 'insert_text',
        description: 'Insert the current local date',
        replacement: '2026-04-12',
        preview: '2026-04-12',
        aliases: ['today']
      }
    ] satisfies EditorAtMacroEntry[]

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorAtMenu, {
            open: true,
            index: 0,
            left: 0,
            top: 0,
            query: '',
            items
          })
      }
    }))

    app.mount(root)

    expect(root.querySelector('.editor-at-item__group')).toBeNull()
    expect(root.querySelector('.editor-at-item__kind')?.textContent).toBe('TXT')

    app.unmount()
    document.body.innerHTML = ''
  })

  it('surfaces AI actions with a distinct kind label and preview', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const items = [
      {
        id: 'summarize',
        label: 'Summarize',
        group: 'AI',
        kind: 'open_pulse',
        description: 'Open Pulse',
        replacement: '',
        preview: 'Open Pulse',
        aliases: ['summary'],
        pulse: { actionId: 'synthesize', instruction: 'Summarize.' }
      }
    ] satisfies EditorAtMacroEntry[]

    const app = createApp(defineComponent({
      setup() {
        return () =>
          h(EditorAtMenu, {
            open: true,
            index: 0,
            left: 0,
            top: 0,
            query: '',
            items
          })
      }
    }))

    app.mount(root)

    expect(root.querySelector('.editor-at-item__kind')?.textContent).toBe('AI')
    expect(root.querySelector('.editor-at-item__replacement')?.textContent).toBe('Open Pulse')

    app.unmount()
    document.body.innerHTML = ''
  })
})
