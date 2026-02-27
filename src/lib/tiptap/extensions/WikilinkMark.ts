import { Mark, mergeAttributes } from '@tiptap/core'
import { parseWikilinkTarget } from '../../wikilinks'
import { TIPTAP_NODE_TYPES } from '../types'

export const WikilinkMark = Mark.create({
  name: TIPTAP_NODE_TYPES.wikilink,
  inclusive: false,

  addAttributes() {
    return {
      target: {
        default: ''
      }
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wikilink-target]',
        getAttrs: (element) => ({
          target: (element as HTMLElement).getAttribute('data-wikilink-target') ?? ''
        })
      }
    ]
  },

  renderHTML({ mark, HTMLAttributes }) {
    const target = String(mark.attrs.target ?? '').trim()
    const parsed = parseWikilinkTarget(target)
    const href = `wikilink:${encodeURIComponent(target)}`
    const defaultLabel = parsed.anchor?.heading && !parsed.notePath ? parsed.anchor.heading : target
    return ['a', mergeAttributes(HTMLAttributes, {
      href,
      'data-wikilink-target': target,
      class: 'md-wikilink',
      title: defaultLabel
    }), 0]
  },
})
