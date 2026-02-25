import type { OutputBlockData } from '@editorjs/editorjs'
import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVirtualTitleBehavior } from './useVirtualTitleBehavior'

function createBehavior(overrides: Partial<Parameters<typeof useVirtualTitleBehavior>[0]> = {}) {
  const holder = ref<HTMLElement | null>(document.createElement('div'))
  const currentPath = ref('notes/My Note.md')
  const saveEditorData = vi.fn(async () => ({ blocks: [] as OutputBlockData[] }))
  const renderBlocks = vi.fn(async (_blocks: OutputBlockData[]) => {})

  const options: Parameters<typeof useVirtualTitleBehavior>[0] = {
    virtualTitleBlockId: '__virtual_title__',
    holder,
    currentPath,
    hasActiveEditor: () => true,
    isSuppressOnChange: () => false,
    saveEditorData,
    renderBlocks,
    ...overrides
  }

  return {
    behavior: useVirtualTitleBehavior(options),
    holder,
    currentPath,
    saveEditorData,
    renderBlocks
  }
}

describe('useVirtualTitleBehavior', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps normalized virtual-title blocks idempotent', () => {
    const { behavior } = createBehavior()
    const blocks: OutputBlockData[] = [
      { id: '__virtual_title__', type: 'header', data: { level: 1, text: 'My Note' } } as OutputBlockData,
      { id: 'p1', type: 'paragraph', data: { text: 'Body' } } as OutputBlockData
    ]

    const normalized = behavior.withVirtualTitle(blocks, 'My Note')

    expect(normalized.changed).toBe(false)
    expect(normalized.blocks).toHaveLength(2)
    expect(normalized.blocks[0].id).toBe('__virtual_title__')
    expect(normalized.blocks[1].id).toBe('p1')
  })

  it('preserves non-title content blocks while rewriting title block', () => {
    const { behavior } = createBehavior()
    const blocks: OutputBlockData[] = [
      { id: 'p1', type: 'paragraph', data: { text: 'first' } } as OutputBlockData,
      { id: '__virtual_title__', type: 'header', data: { level: 1, text: 'Old' } } as OutputBlockData,
      { id: 'p2', type: 'paragraph', data: { text: 'second' } } as OutputBlockData
    ]

    const normalized = behavior.withVirtualTitle(blocks, 'New Title')

    expect(normalized.changed).toBe(true)
    expect(normalized.blocks.map((block) => block.id)).toEqual(['__virtual_title__', 'p1', 'p2'])
    expect((normalized.blocks[0].data as Record<string, unknown>).text).toBe('New Title')
  })

  it('derives fallback title from path when enforcing invalid first block structure', async () => {
    const saveEditorData = vi.fn(async () => ({
      blocks: [{ id: 'p1', type: 'paragraph', data: { text: '' } } as OutputBlockData]
    }))
    const renderBlocks = vi.fn(async (_blocks: OutputBlockData[]) => {})
    const { behavior, currentPath } = createBehavior({ saveEditorData, renderBlocks })

    currentPath.value = 'notes/Inbox.md'
    await behavior.enforceVirtualTitleStructure()

    expect(renderBlocks).toHaveBeenCalledTimes(1)
    const call = renderBlocks.mock.calls[0]
    expect(call).toBeDefined()
    const rendered = (call?.[0] ?? []) as unknown as OutputBlockData[]
    expect(rendered[0].id).toBe('__virtual_title__')
    expect((rendered[0].data as Record<string, unknown>).text).toBe('Inbox')
  })

  it('schedules virtual-title lock and repairs invalid DOM shape', async () => {
    vi.useFakeTimers()

    const holderElement = document.createElement('div')
    const firstBlock = document.createElement('div')
    firstBlock.className = 'ce-block'
    firstBlock.dataset.id = 'not_virtual'
    holderElement.appendChild(firstBlock)

    const saveEditorData = vi.fn(async () => ({
      blocks: [{ id: 'p1', type: 'paragraph', data: { text: 'Body' } } as OutputBlockData]
    }))
    const renderBlocks = vi.fn(async (_blocks: OutputBlockData[]) => {})

    const { behavior } = createBehavior({
      holder: ref(holderElement),
      saveEditorData,
      renderBlocks
    })

    behavior.scheduleVirtualTitleLock()
    await vi.advanceTimersByTimeAsync(90)

    expect(saveEditorData).toHaveBeenCalledTimes(1)
    expect(renderBlocks).toHaveBeenCalledTimes(1)
  })
})
