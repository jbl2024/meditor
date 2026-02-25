import { describe, expect, it, vi } from 'vitest'

let receivedArgs: Record<string, unknown> | null = null

vi.mock('@editorjs/table', () => {
  class MockTable {
    static toolbox = { title: 'Table' }

    constructor(args: Record<string, unknown>) {
      receivedArgs = args
    }

    render() {
      return document.createElement('div')
    }

    save() {
      return { withHeadings: false, content: [['a']] }
    }
  }

  return { default: MockTable }
})

import TableTool from './TableTool'

describe('TableTool', () => {
  it('forces withHeadings=true during construction and save', async () => {
    const tool = new TableTool({
      data: {
        withHeadings: false,
        content: [['x']]
      }
    })

    expect((receivedArgs?.data as { withHeadings?: boolean } | undefined)?.withHeadings).toBe(true)

    const saved = await tool.save(document.createElement('div'))
    expect(saved.withHeadings).toBe(true)
  })
})
