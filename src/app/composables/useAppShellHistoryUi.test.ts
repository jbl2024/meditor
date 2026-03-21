import { effectScope, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentHistoryEntry } from '../../domains/editor/composables/useDocumentHistory'
import { useAppShellHistoryUi } from './useAppShellHistoryUi'

function createHistoryUi() {
  const anchor = document.createElement('button')
  document.body.appendChild(anchor)
  Object.defineProperty(anchor, 'getBoundingClientRect', {
    value: () => ({
      left: 120,
      right: 160,
      top: 24,
      bottom: 48,
      width: 40,
      height: 24,
      x: 120,
      y: 24,
      toJSON: () => ({})
    })
  })

  const closeOverflowMenu = vi.fn()
  const goBackInHistory = vi.fn(async () => {})
  const goForwardInHistory = vi.fn(async () => {})
  const openHistoryEntry = vi.fn(async () => true)
  const jumpToEntry = vi.fn((index: number): DocumentHistoryEntry => ({
    kind: 'home',
    path: String(index),
    label: `item-${index}`,
    stateKey: String(index),
    payload: null
  }))
  const scope = effectScope()
  const api = scope.run(() => useAppShellHistoryUi({
    topbarPort: {
      getHistoryButtonEl: () => anchor,
      containsOverflowTarget: (target) => target === anchor,
      containsHistoryMenuTarget: (side, target) => side === 'back' && target === anchor
    },
    closeOverflowMenu,
    canOpenMenu: () => true,
    getTargetCount: (side) => side === 'back' ? 4 : 2,
    navigationPort: {
      goBackInHistory,
      goForwardInHistory,
      openHistoryEntry,
      documentHistory: {
        currentIndex: ref(2),
        jumpToEntry
      },
      isApplyingHistoryNavigation: ref(false)
    }
  }))
  if (!api) throw new Error('Expected history UI controller')
  return { api, scope, closeOverflowMenu, anchor, goBackInHistory, goForwardInHistory, openHistoryEntry, jumpToEntry }
}

describe('useAppShellHistoryUi', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('opens and positions a history menu from the context menu', () => {
    const { api, scope, closeOverflowMenu } = createHistoryUi()
    const event = new MouseEvent('contextmenu', { bubbles: true })
    Object.defineProperty(event, 'preventDefault', { value: vi.fn() })

    api.onHistoryButtonContextMenu('back', event)

    expect(closeOverflowMenu).toHaveBeenCalled()
    expect(api.historyMenuOpen.value).toBe('back')
    expect(api.historyMenuStyle.value.position).toBe('fixed')
    scope.stop()
  })

  it('starts long-press opening on pointer down', async () => {
    vi.useFakeTimers()
    const { api, scope } = createHistoryUi()

    api.onHistoryButtonPointerDown('forward', { button: 0 } as PointerEvent)
    await vi.advanceTimersByTimeAsync(420)

    expect(api.historyMenuOpen.value).toBe('forward')
    scope.stop()
  })

  it('consumes the click that follows a long press', async () => {
    vi.useFakeTimers()
    const { api, scope } = createHistoryUi()

    api.onHistoryButtonPointerDown('back', { button: 0 } as PointerEvent)
    await vi.advanceTimersByTimeAsync(420)

    expect(api.shouldConsumeHistoryButtonClick('back')).toBe(true)
    expect(api.historyMenuOpen.value).toBe('back')
    scope.stop()
  })

  it('routes button clicks to history navigation when they are not consumed by a long press', async () => {
    const { api, scope, goBackInHistory, goForwardInHistory } = createHistoryUi()

    api.onHistoryButtonClick('back')
    api.onHistoryButtonClick('forward')

    expect(goBackInHistory).toHaveBeenCalledTimes(1)
    expect(goForwardInHistory).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('replays a target entry and restores the previous index if opening fails', async () => {
    const { api, scope, openHistoryEntry, jumpToEntry } = createHistoryUi()
    openHistoryEntry.mockResolvedValueOnce(false)

    api.openHistoryMenu('back')
    api.onHistoryTargetClick(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(openHistoryEntry).toHaveBeenCalled()
    expect(jumpToEntry).toHaveBeenNthCalledWith(1, 1)
    expect(jumpToEntry).toHaveBeenNthCalledWith(2, 2)
    scope.stop()
  })

  it('closes on outside pointer down', () => {
    const { api, scope } = createHistoryUi()
    api.openHistoryMenu('forward')

    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const event = new MouseEvent('mousedown', { bubbles: true })
    Object.defineProperty(event, 'target', { value: outside })
    api.onGlobalPointerDown(event, true)

    expect(api.historyMenuOpen.value).toBeNull()
    scope.stop()
  })

  it('repositions the menu on window resize', () => {
    const { api, scope } = createHistoryUi()
    api.openHistoryMenu('back')
    const previousTop = api.historyMenuStyle.value.top

    api.onWindowResize()

    expect(api.historyMenuStyle.value.top).toBe(previousTop)
    scope.stop()
  })
})
