import { describe, expect, it, vi } from 'vitest'
import { createEditorTools } from './editorTools'

describe('createEditorTools', () => {
  it('builds expected tool keys', () => {
    const tools = createEditorTools(vi.fn(async () => true))

    expect(Object.keys(tools)).toEqual([
      'paragraph',
      'header',
      'list',
      'quote',
      'table',
      'callout',
      'mermaid',
      'code',
      'delimiter',
      'inlineCode',
      'strikethrough',
      'underline'
    ])
  })

  it('enables rich inline toolbar for heading/list/quote', () => {
    const tools = createEditorTools(vi.fn(async () => true))

    expect(tools.header.inlineToolbar).toEqual(['bold', 'italic', 'strikethrough', 'underline', 'link', 'inlineCode'])
    expect(tools.list.inlineToolbar).toEqual(['bold', 'italic', 'strikethrough', 'underline', 'link', 'inlineCode'])
    expect(tools.quote.inlineToolbar).toEqual(['bold', 'italic', 'strikethrough', 'underline', 'link', 'inlineCode'])
  })

  it('forwards mermaid confirmation callback into tool config', async () => {
    const confirmReplace = vi.fn(async () => true)
    const tools = createEditorTools(confirmReplace)

    const approved = await tools.mermaid.config.confirmReplace({ templateLabel: 'Flow' })

    expect(approved).toBe(true)
    expect(confirmReplace).toHaveBeenCalledWith({ templateLabel: 'Flow' })
  })
})
