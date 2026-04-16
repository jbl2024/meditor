import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

const hoisted = vi.hoisted(() => ({
  readImageDataUrl: vi.fn(async () => 'data:image/png;base64,ZmFrZQ==')
}))

vi.mock('../../../../../shared/api/workspaceApi', () => ({
  readImageDataUrl: hoisted.readImageDataUrl
}))

import NoteEmbedNodeView from './NoteEmbedNodeView.vue'

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  await new Promise<void>((resolve) => {
    let remainingFrames = 6
    const step = () => {
      remainingFrames -= 1
      if (remainingFrames <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  await nextTick()
}

function mountHarness(options?: {
  target?: string
  preview?: { path: string; html: string } | null
}) {
  const root = document.createElement('div')
  document.body.appendChild(root)

  const target = ref(options?.target ?? 'notes/current.md')
  const loadEmbeddedNotePreview = vi.fn(async () => options?.preview ?? null)
  const openLinkTarget = vi.fn(async () => {})
  const openEmbeddedNote = vi.fn(async () => {})

  const Harness = defineComponent({
    setup() {
      return () => h(NoteEmbedNodeView, {
        node: { attrs: { target: target.value } },
        editor: { isEditable: true } as any,
        extension: {
          options: {
            loadEmbeddedNotePreview,
            openEmbeddedNote,
            openLinkTarget,
            restoreEmbeddedNoteInline: vi.fn(async () => {})
          }
        }
      })
    }
  })

  const app = createApp(Harness)
  app.provide('onDragStart', () => {})
  app.provide('decorationClasses', ref(''))
  app.mount(root)

  return { app, root, loadEmbeddedNotePreview, openLinkTarget, openEmbeddedNote }
}

describe('NoteEmbedNodeView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('hydrates absolute local image sources in embedded previews to data urls', async () => {
    const harness = mountHarness({
      preview: {
        path: '/vault/notes/current.md',
        html: '<p><img src="/vault/assets/images/Formulaire_GLPI/preview.png" alt="Preview"></p>'
      }
    })
    await flush()

    const image = harness.root.querySelector('.tomosona-note-embed-preview img') as HTMLImageElement | null
    expect(image).toBeTruthy()
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,ZmFrZQ==')
    expect(hoisted.readImageDataUrl).toHaveBeenCalledWith('/vault/assets/images/Formulaire_GLPI/preview.png')
    expect(harness.loadEmbeddedNotePreview).toHaveBeenCalledWith('notes/current.md')

    harness.app.unmount()
  })

  it('decodes percent-encoded embedded preview image paths before reading them', async () => {
    const harness = mountHarness({
      preview: {
        path: '/vault/notes/current.md',
        html: '<p><img src="/vault/assets/images/Formulaire_GLPI/Pasted%20image%2020260325152608.png" alt="Preview"></p>'
      }
    })
    await flush()

    expect(hoisted.readImageDataUrl).toHaveBeenCalledWith(
      '/vault/assets/images/Formulaire_GLPI/Pasted image 20260325152608.png'
    )

    harness.app.unmount()
  })

  it('opens relative markdown links inside embedded previews from the preview path', async () => {
    const harness = mountHarness({
      preview: {
        path: '/vault/notes/projects/current.md',
        html: '<p><a href="mattermost/index.md">Mattermost</a></p>'
      }
    })
    await flush()

    const link = harness.root.querySelector('.tomosona-note-embed-preview a') as HTMLAnchorElement | null
    expect(link).toBeTruthy()
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flush()

    expect(harness.openLinkTarget).toHaveBeenCalledWith('/vault/notes/projects/mattermost/index.md')
    expect(harness.openEmbeddedNote).not.toHaveBeenCalled()

    harness.app.unmount()
  })
})
