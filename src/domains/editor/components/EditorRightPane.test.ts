import { createApp, defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import EditorRightPane from './EditorRightPane.vue'

describe('EditorRightPane', () => {
  it('renders workflow sections and forwards intents', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const onOutlineClick = vi.fn()
    const onBacklinkOpen = vi.fn()
    const onToggleFavorite = vi.fn()
    const onOpenNoteHistory = vi.fn()
    const onActiveNoteToggleSourceMode = vi.fn()
    const onActiveNoteAddToContext = vi.fn()
    const onActiveNoteRemoveFromContext = vi.fn()
    const onActiveNoteOpenCosmos = vi.fn()
    const onActiveNoteOpenPulse = vi.fn()
    const onEchoesAddToContext = vi.fn()
    const onEchoesReindex = vi.fn()
    const onContextOpen = vi.fn()
    const onContextRemoveLocal = vi.fn()
    const onContextRemovePinned = vi.fn()
    const onContextPin = vi.fn()
    const onContextClearLocal = vi.fn()
    const onContextClearPinned = vi.fn()
    const onContextOpenSecondBrain = vi.fn()
    const onContextOpenCosmos = vi.fn()
    const onContextOpenPulse = vi.fn()

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorRightPane, {
          width: 320,
          activeNotePath: '/wk/notes/a.md',
          activeNoteTitle: 'A',
          activeStateLabel: 'saved',
          activeNoteSourceToggleLabel: 'Edit raw text',
          backlinkCount: 1,
          semanticLinkCount: 2,
          activeNoteInContext: false,
          canToggleFavorite: true,
          isFavorite: true,
          indexingState: 'out_of_sync',
          echoesItems: [{
            path: '/wk/notes/e.md',
            title: 'Echo',
            reasonLabel: 'Direct link',
            reasonLabels: ['Direct link'],
            score: 1,
            signalSources: ['direct'],
            isInContext: false
          }],
          echoesLoading: false,
          echoesError: '',
          echoesHintVisible: true,
          localContextItems: [{ path: '/wk/notes/c.md', title: 'Context' }],
          pinnedContextItems: [{ path: '/wk/notes/p.md', title: 'Pinned' }],
          canReasonOnContext: true,
          isLaunchingContextAction: false,
          outline: [{ level: 2, text: 'Roadmap' }],
          semanticLinks: [{ path: '/wk/notes/s.md', score: 0.88, direction: 'outgoing' }],
          semanticLinksLoading: false,
          semanticLinksError: '',
          backlinks: ['/wk/notes/a.md'],
          backlinksLoading: false,
          backlinksError: '',
          metadataRows: [{ label: 'Path', value: 'notes/a.md' }],
          propertiesPreview: [{ key: 'tags', value: 'doc' }],
          propertyParseErrorCount: 0,
          toRelativePath: (path: string) => path.replace('/wk/', ''),
          onToggleFavorite,
          onOpenNoteHistory,
          onActiveNoteToggleSourceMode,
          onOutlineClick,
          onBacklinkOpen,
          onActiveNoteAddToContext,
          onActiveNoteRemoveFromContext,
          onActiveNoteOpenCosmos,
          onActiveNoteOpenPulse,
          onEchoesAddToContext,
          onEchoesReindex,
          onContextOpen,
          onContextRemoveLocal,
          onContextRemovePinned,
          onContextPin,
          onContextClearLocal,
          onContextClearPinned,
          onContextOpenSecondBrain,
          onContextOpenCosmos,
          onContextOpenPulse
        })
      }
    }))

    app.mount(root)
    const sectionTitles = Array.from(root.querySelectorAll('.section-title')).map((el) => el.textContent?.trim())
    expect(sectionTitles.slice(0, 6)).toEqual([
      'Active Note',
      'Echoes',
      'Note Context',
      'Pinned Context',
      'Outline',
      'Semantic Links'
    ])
    expect(root.querySelectorAll('.section-toggle')).toHaveLength(6)
    expect(root.querySelector('.favorite-toggle-btn--active')).toBeTruthy()
    expect(root.textContent).toContain('Reason on This Context')
    expect(root.textContent).toContain('Explore in Cosmos')
    expect(root.textContent).toContain('Pulse')
    expect(root.textContent).toContain('Edit raw text')
    expect(root.textContent).toContain('Transform with Pulse')

    ;(root.querySelector('.favorite-toggle-btn') as HTMLButtonElement).click()
    expect(onToggleFavorite).toHaveBeenCalledTimes(1)

    const noteButtons = Array.from(root.querySelectorAll('.secondary-note-btn')) as HTMLButtonElement[]
    noteButtons[0].click()
    expect(onActiveNoteOpenCosmos).toHaveBeenCalledTimes(1)
    noteButtons[1].click()
    expect(onActiveNoteOpenPulse).toHaveBeenCalledTimes(1)

    const utilityButtons = Array.from(root.querySelectorAll('.utility-note-btn')) as HTMLButtonElement[]
    utilityButtons[0].click()
    expect(onOpenNoteHistory).toHaveBeenCalledTimes(1)
    utilityButtons[1].click()
    expect(onActiveNoteToggleSourceMode).toHaveBeenCalledTimes(1)

    ;(root.querySelector('.primary-context-btn') as HTMLButtonElement).click()
    expect(onActiveNoteAddToContext).toHaveBeenCalledTimes(1)

    ;(root.querySelector('.active-note-section-toggle') as HTMLButtonElement).click()
    await nextTick()
    expect(root.querySelector('.favorite-toggle-btn')).toBeNull()
    expect(root.querySelector('.primary-context-btn')).toBeNull()
    expect(root.querySelectorAll('.secondary-note-btn')).toHaveLength(0)
    expect(root.querySelectorAll('.utility-note-btn')).toHaveLength(0)

    const echoesButtons = Array.from(root.querySelectorAll('.echoes-action-btn')) as HTMLButtonElement[]
    echoesButtons[0].click()
    expect(onEchoesAddToContext).toHaveBeenCalledWith('/wk/notes/e.md')
    ;(root.querySelector('.echoes-mark-btn') as HTMLButtonElement).click()
    expect(onEchoesReindex).toHaveBeenCalledTimes(1)

    ;(root.querySelector('.context-open-btn') as HTMLButtonElement).click()
    expect(onContextOpen).toHaveBeenCalledWith('/wk/notes/c.md')

    const removeButtons = Array.from(root.querySelectorAll('.context-remove-btn')) as HTMLButtonElement[]
    removeButtons[0].click()
    removeButtons[1].click()
    expect(onContextRemoveLocal).toHaveBeenCalledWith('/wk/notes/c.md')
    expect(onContextRemovePinned).toHaveBeenCalledWith('/wk/notes/p.md')

    const iconButtons = Array.from(root.querySelectorAll('.context-icon-btn')) as HTMLButtonElement[]
    iconButtons[0].click()
    iconButtons[1].click()
    iconButtons[2].click()
    expect(onContextPin).toHaveBeenCalledTimes(1)
    expect(onContextClearLocal).toHaveBeenCalledTimes(1)
    expect(onContextClearPinned).toHaveBeenCalledTimes(1)

    const ctaButtons = Array.from(root.querySelectorAll('.context-primary-cta, .context-link-btn')) as HTMLButtonElement[]
    ctaButtons[0].click()
    ctaButtons[1].click()
    ctaButtons[2].click()
    expect(onContextOpenSecondBrain).toHaveBeenCalledTimes(1)
    expect(onContextOpenCosmos).toHaveBeenCalledTimes(1)
    expect(onContextOpenPulse).toHaveBeenCalledTimes(1)

    const toggles = Array.from(root.querySelectorAll('.section-toggle')) as HTMLButtonElement[]
    toggles[1].click()
    toggles[2].click()
    toggles[3].click()
    await nextTick()

    const outlineButton = Array.from(root.querySelectorAll('.pane-item')).find((item) =>
      item.textContent?.includes('Roadmap')
    ) as HTMLButtonElement | undefined
    expect(outlineButton).toBeTruthy()
    outlineButton?.click()
    expect(onOutlineClick).toHaveBeenCalledWith({ index: 0, heading: { level: 2, text: 'Roadmap' } })

    const backlinkButton = Array.from(root.querySelectorAll('.pane-item')).find((item) =>
      item.textContent?.includes('notes/a.md')
    ) as HTMLButtonElement | undefined
    backlinkButton?.click()
    expect(onBacklinkOpen).toHaveBeenCalledWith('/wk/notes/a.md')

    expect(root.querySelector('.right-pane')?.getAttribute('style')).toContain('width: 320px;')

    app.unmount()
    document.body.innerHTML = ''
  })

  it('hides pinned context when no notes are pinned and keeps actions disabled', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorRightPane, {
          width: 280,
          activeNotePath: '/wk/notes/a.md',
          activeNoteTitle: 'A',
          activeStateLabel: 'saved',
          activeNoteSourceToggleLabel: '',
          backlinkCount: 0,
          semanticLinkCount: 0,
          activeNoteInContext: true,
          canToggleFavorite: false,
          isFavorite: false,
          indexingState: 'indexed',
          echoesItems: [],
          echoesLoading: false,
          echoesError: '',
          echoesHintVisible: false,
          localContextItems: [],
          pinnedContextItems: [],
          canReasonOnContext: false,
          isLaunchingContextAction: false,
          outline: [],
          semanticLinks: [],
          semanticLinksLoading: false,
          semanticLinksError: '',
          backlinks: [],
          backlinksLoading: false,
          backlinksError: '',
          metadataRows: [],
          propertiesPreview: [],
          propertyParseErrorCount: 0,
          toRelativePath: (path: string) => path
        })
      }
    }))

    app.mount(root)
    expect(root.textContent).not.toContain('Pinned Context')
    expect((root.querySelector('.context-primary-cta') as HTMLButtonElement).disabled).toBe(true)
    app.unmount()
  })

  it('renders backlink and semantic link errors instead of a fake empty state', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)

    const app = createApp(defineComponent({
      setup() {
        return () => h(EditorRightPane, {
          width: 280,
          activeNotePath: '/wk/notes/a.md',
          activeNoteTitle: 'A',
          activeStateLabel: 'saved',
          backlinkCount: 0,
          semanticLinkCount: 0,
          activeNoteInContext: false,
          canToggleFavorite: false,
          isFavorite: false,
          indexingState: 'indexed',
          echoesItems: [],
          echoesLoading: false,
          echoesError: '',
          echoesHintVisible: false,
          localContextItems: [],
          pinnedContextItems: [],
          canReasonOnContext: false,
          isLaunchingContextAction: false,
          outline: [],
          semanticLinks: [],
          semanticLinksLoading: false,
          semanticLinksError: 'Could not load semantic links.',
          backlinks: [],
          backlinksLoading: false,
          backlinksError: 'Could not load backlinks.',
          metadataRows: [],
          propertiesPreview: [],
          propertyParseErrorCount: 0,
          toRelativePath: (path: string) => path
        })
      }
    }))

    app.mount(root)
    await nextTick()
    expect(root.textContent).toContain('Could not load semantic links.')
    expect(root.textContent).toContain('Could not load backlinks.')
    expect(root.textContent).not.toContain('No semantic links')
    expect(root.textContent).not.toContain('No backlinks')
    app.unmount()
  })
})
