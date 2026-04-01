import { describe, expect, it, vi } from 'vitest'
import { extractSelectedMarkdownBlocks } from './selectionExtraction'

function createEditorStub(options?: {
  fromParentOffset?: number
  toParentOffset?: number
  toParentContentSize?: number
  content?: unknown[]
  empty?: boolean
}) {
  const blocks = options?.content ?? [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Alpha' }]
    }
  ]

  return {
    state: {
      selection: {
        empty: options?.empty ?? false,
        $from: {
          parentOffset: options?.fromParentOffset ?? 0
        },
        $to: {
          parentOffset: options?.toParentOffset ?? 5,
          parent: {
            content: {
              size: options?.toParentContentSize ?? 5
            }
          }
        },
        content: vi.fn(() => ({
          content: {
            toJSON: vi.fn(() => blocks)
          }
        }))
      }
    }
  } as any
}

describe('extractSelectedMarkdownBlocks', () => {
  it('extracts block-complete markdown selections', () => {
    const editor = createEditorStub()

    const extracted = extractSelectedMarkdownBlocks(editor)

    expect(extracted).toEqual({
      blocks: [
        {
          type: 'paragraph',
          data: {
            text: 'Alpha'
          }
        }
      ],
      markdown: 'Alpha\n'
    })
  })

  it('rejects partial selections', () => {
    const editor = createEditorStub({ fromParentOffset: 1, toParentOffset: 5 })

    expect(extractSelectedMarkdownBlocks(editor)).toBeNull()
  })

  it('rejects empty selections', () => {
    const editor = createEditorStub({ empty: true })

    expect(extractSelectedMarkdownBlocks(editor)).toBeNull()
  })
})
