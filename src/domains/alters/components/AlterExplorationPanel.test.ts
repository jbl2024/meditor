import { createApp, defineComponent, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import AlterExplorationPanel from './AlterExplorationPanel.vue'

function mountPanel() {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const app = createApp(defineComponent({
    setup() {
      return () => h(AlterExplorationPanel, {
        workspacePath: '/vault',
        allWorkspaceFiles: [],
        activeNotePath: '',
        availableAlters: [
          {
            id: 'alter-a',
            name: 'Sober Architect',
            slug: 'sober-architect',
            description: 'Tests structure.',
            icon: null,
            color: null,
            category: 'Strategy',
            mission: 'Stress test designs.',
            is_favorite: false,
            is_built_in: false,
            revision_count: 0,
            updated_at_ms: 1
          },
          {
            id: 'alter-b',
            name: 'Pragmatic Builder',
            slug: 'pragmatic-builder',
            description: 'Optimizes delivery.',
            icon: null,
            color: null,
            category: 'Execution',
            mission: 'Ship reliable plans.',
            is_favorite: false,
            is_built_in: false,
            revision_count: 0,
            updated_at_ms: 1
          }
        ]
      })
    }
  }))

  app.mount(root)
  return { app, root }
}

describe('AlterExplorationPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the exploration setup and timeline', async () => {
    const mounted = mountPanel()
    await nextTick()

    expect(mounted.root.textContent).toContain('Alter Exploration')
    expect(mounted.root.textContent).toContain('Start exploration')
    expect(mounted.root.textContent).toContain('Round-by-round output')

    mounted.app.unmount()
  })
})
