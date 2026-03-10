import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import WorkspaceLaunchpad from './WorkspaceLaunchpad.vue'

function mountLaunchpad() {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = createApp(defineComponent({
    setup() {
      return () => h(WorkspaceLaunchpad, {
        mode: 'workspace-launchpad',
        workspaceLabel: 'vault',
        recentWorkspaces: [],
        recentViewedNotes: [{
          path: '/vault/viewed.md',
          title: 'Viewed note',
          relativePath: 'viewed.md',
          recencyLabel: 'opened 2 hours ago'
        }],
        recentUpdatedNotes: [{
          path: '/vault/updated.md',
          title: 'Updated note',
          relativePath: 'updated.md',
          recencyLabel: 'updated 1 hour ago'
        }],
        showWizardAction: false
      })
    }
  }))

  app.mount(root)
  return { app, root }
}

describe('WorkspaceLaunchpad', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('defaults to viewed notes and switches to updated notes', async () => {
    const mounted = mountLaunchpad()
    await nextTick()

    expect(mounted.root.textContent).toContain('Viewed note')
    expect(mounted.root.textContent).not.toContain('Updated note')

    mounted.root.querySelector<HTMLButtonElement>('[data-launchpad-tab="updated"]')?.click()
    await nextTick()

    expect(mounted.root.textContent).toContain('Updated note')
    expect(mounted.root.textContent).not.toContain('Viewed note')

    mounted.app.unmount()
  })
})
