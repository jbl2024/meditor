import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import WorkspaceEntryModals from './WorkspaceEntryModals.vue'
import type { NewNoteTemplateDropdownItem } from '../../lib/newNoteTemplates'

function mountHarness() {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const newFilePath = ref('notes/test')
  const templatePath = ref('')
  const events: string[] = []
  const templateItems: NewNoteTemplateDropdownItem[] = [
    { id: 'blank-note', label: 'Blank note', path: '', kind: 'blank', group: 'Start empty' },
    { id: 'template-root', label: 'root.md', path: '/vault/_templates/root.md', kind: 'template', group: 'Workspace root' },
    {
      id: 'template-meetings',
      label: 'regular.md',
      path: '/vault/_templates/meetings/regular.md',
      kind: 'template',
      group: 'meetings'
    }
  ]

  const app = createApp(defineComponent({
    setup() {
      return () =>
        h(WorkspaceEntryModals, {
          newFileVisible: true,
          newFilePathInput: newFilePath.value,
          newFileError: '',
          newFileTemplateItems: templateItems,
          newFileTemplatePath: templatePath.value,
          newFolderVisible: false,
          newFolderPathInput: '',
          newFolderError: '',
          openDateVisible: false,
          openDateInput: '',
          openDateError: '',
          onCloseNewFile: () => events.push('close-file'),
          onUpdateNewFilePath: (value: string) => {
            newFilePath.value = value
            events.push(`file:${value}`)
          },
          onKeydownNewFile: () => events.push('keydown-file'),
          onSelectNewFileTemplate: (value: string) => {
            templatePath.value = value
            events.push(`template:${value}`)
          },
          onSubmitNewFile: () => events.push('submit-file'),
          onCloseNewFolder: () => {},
          onUpdateNewFolderPath: () => {},
          onKeydownNewFolder: () => {},
          onSubmitNewFolder: () => {},
          onCloseOpenDate: () => {},
          onUpdateOpenDate: () => {},
          onKeydownOpenDate: () => {},
          onSubmitOpenDate: () => {}
        })
    }
  }))

  app.mount(root)
  return { app, root, events, newFilePath, templatePath }
}

describe('WorkspaceEntryModals', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('emits new file modal interactions', async () => {
    const mounted = mountHarness()
    await nextTick()
    const input = mounted.root.querySelector<HTMLInputElement>('[data-new-file-input="true"]')

    if (input) {
      input.value = 'notes/updated'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    const submit = Array.from(mounted.root.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Create')
    submit?.click()

    expect(mounted.newFilePath.value).toBe('notes/updated')
    expect(mounted.events).toEqual(['file:notes/updated', 'keydown-file', 'submit-file'])

    mounted.app.unmount()
  })

  it('shows template sections and emits the selected template path', async () => {
    const mounted = mountHarness()
    await nextTick()

    const templateTrigger = Array.from(mounted.root.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Blank note')
    )
    templateTrigger?.click()
    await nextTick()

    const groups = Array.from(document.body.querySelectorAll('.ui-filterable-dropdown-group')).map((node) => node.textContent?.trim())
    expect(groups).toEqual(['Start empty', 'Workspace root', 'meetings'])

    const regularTemplate = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'regular.md'
    )
    regularTemplate?.click()
    await nextTick()

    expect(mounted.events).toContain('template:/vault/_templates/meetings/regular.md')
    expect(mounted.templatePath.value).toBe('/vault/_templates/meetings/regular.md')
    expect(mounted.newFilePath.value).toBe('notes/test')
    const noteInput = mounted.root.querySelector<HTMLInputElement>('[data-new-file-input="true"]')
    expect(document.activeElement).toBe(noteInput)
    expect(noteInput?.selectionStart).toBe(noteInput?.value.length)
    expect(noteInput?.selectionEnd).toBe(noteInput?.value.length)

    mounted.app.unmount()
  })

  it('renders the template menu in a portal outside the modal body', async () => {
    const mounted = mountHarness()
    await nextTick()

    const templateTrigger = Array.from(mounted.root.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Blank note')
    )
    templateTrigger?.click()
    await nextTick()

    expect(mounted.root.querySelector('.ui-filterable-dropdown-menu')).toBeNull()
    expect(document.body.querySelector('.ui-filterable-dropdown-menu')).toBeTruthy()

    mounted.app.unmount()
  })
})
