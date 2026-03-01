import { describe, expect, it } from 'vitest'
import { fromTiptapDoc } from './tiptapDocToEditorBlocks'

describe('fromTiptapDoc html block', () => {
  it('maps htmlBlock nodes to html blocks', () => {
    const blocks = fromTiptapDoc({
      type: 'doc',
      content: [
        {
          type: 'htmlBlock',
          attrs: {
            html: '<div><em>Hi</em></div>'
          }
        }
      ]
    })

    expect(blocks).toEqual([
      {
        type: 'html',
        data: {
          html: '<div><em>Hi</em></div>'
        }
      }
    ])
  })
})
