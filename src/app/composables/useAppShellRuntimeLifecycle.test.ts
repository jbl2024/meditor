import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppShellRuntimeLifecycle } from './useAppShellRuntimeLifecycle'

describe('useAppShellRuntimeLifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('boots global runtime effects once and tears them down symmetrically', async () => {
    const mediaQuery = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList
    let openTraceListener: ((active: boolean) => void) | null = null

    const initializeShellPersistence = vi.fn()
    const syncAlterSettingsFromDisk = vi.fn(async () => {})
    const workspaceStart = vi.fn(async () => {})
    const workspaceDispose = vi.fn()
    const installOpenDebugLongTaskObserver = vi.fn()
    const subscribeOpenTraceActivity = vi.fn((listener: (active: boolean) => void) => {
      openTraceListener = listener
      return vi.fn()
    })
    const onOpenTraceActivityChange = vi.fn()
    const onSystemThemeChanged = vi.fn()
    const onGlobalPointerDown = vi.fn()
    const onWindowResize = vi.fn()
    const onPointerMove = vi.fn()
    const stopResize = vi.fn()
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const runtime = useAppShellRuntimeLifecycle({
      persistencePort: {
        initializeShellPersistence
      },
      alterSettingsPort: {
        syncAlterSettingsFromDisk
      },
      workspaceLifecyclePort: {
        start: workspaceStart,
        dispose: workspaceDispose
      },
      openTracePort: {
        installOpenDebugLongTaskObserver,
        subscribeOpenTraceActivity,
        onOpenTraceActivityChange
      },
      windowPort: {
        onGlobalPointerDown,
        onWindowResize,
        onPointerMove,
        stopResize
      },
      themePort: {
        mediaQuery,
        onSystemThemeChanged
      }
    })

    await runtime.start()
    await runtime.start()

    expect(initializeShellPersistence).toHaveBeenCalledTimes(1)
    expect(installOpenDebugLongTaskObserver).toHaveBeenCalledTimes(1)
    expect(subscribeOpenTraceActivity).toHaveBeenCalledTimes(1)
    expect(syncAlterSettingsFromDisk).toHaveBeenCalledTimes(1)
    expect(workspaceStart).toHaveBeenCalledTimes(1)
    expect(mediaQuery.addEventListener).toHaveBeenCalledWith('change', onSystemThemeChanged)
    expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', onGlobalPointerDown, true)
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', onWindowResize)
    expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', onPointerMove)
    expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', stopResize)

    expect(openTraceListener).not.toBeNull()
    openTraceListener!(true)
    expect(onOpenTraceActivityChange).toHaveBeenCalledWith(true)

    runtime.dispose()

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', onSystemThemeChanged)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousedown', onGlobalPointerDown, true)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', onWindowResize)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', onPointerMove)
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', stopResize)
    expect(workspaceDispose).toHaveBeenCalledTimes(1)
  })
})
