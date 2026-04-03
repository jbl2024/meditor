import { createApp, defineComponent, h, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import EditorNoteHistoryDialog from './EditorNoteHistoryDialog.vue'

async function flushUi() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('EditorNoteHistoryDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders history rows and emits snapshot selection and restore actions', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const open = ref(true)
    const selectedSnapshotId = ref('snap-2')
    const events: string[] = []

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorNoteHistoryDialog, {
          open: open.value,
          pathLabel: '/vault/notes/demo.md',
          loading: false,
          error: '',
          entries: [
            {
              snapshotId: 'snap-1',
              notePath: '/vault/notes/demo.md',
              createdAtMs: 1,
              reason: 'save',
              contentSize: 5,
              contentHash: 'hash-1'
            },
            {
              snapshotId: 'snap-2',
              notePath: '/vault/notes/demo.md',
              createdAtMs: 2,
              reason: 'restore',
              contentSize: 7,
              contentHash: 'hash-2'
            }
          ],
          selectedSnapshotId: selectedSnapshotId.value,
          currentContent: 'alpha\nbeta',
          snapshotContent: 'alpha\ngamma',
          currentUnavailableMessage: '',
          snapshotLoading: false,
          restorePending: false,
          restoreDisabledReason: '',
          currentIsDirty: false,
          onClose: () => {
            open.value = false
            events.push('close')
          },
          onSelectSnapshot: (snapshotId: string) => {
            selectedSnapshotId.value = snapshotId
            events.push(`select:${snapshotId}`)
          },
          onRestoreSelected: () => events.push('restore')
        })
      }
    }))

    app.mount(root)
    await flushUi()

    expect(root.textContent).toContain('Note history')
    expect(root.textContent).toContain('save')
    expect(root.textContent).toContain('restore')

    const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]
    buttons.find((button) => button.textContent?.includes('snap-1'))?.click()
    buttons.find((button) => button.textContent?.includes('Restore version'))?.click()
    await flushUi()

    expect(events).toContain('select:snap-1')
    expect(events).toContain('restore')
    app.unmount()
  })
})
