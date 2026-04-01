import { Node, mergeAttributes } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { TIPTAP_NODE_TYPES } from '../types'
import NoteEmbedNodeView from '../../../components/editor/tiptap/NoteEmbedNodeView.vue'

export type EmbeddedNotePreview = {
  path: string
  html: string
}

export type NoteEmbedExtensionOptions = {
  loadEmbeddedNotePreview?: (target: string) => Promise<EmbeddedNotePreview | null>
}

export const NoteEmbedNode = Node.create<NoteEmbedExtensionOptions>({
  name: TIPTAP_NODE_TYPES.noteEmbed,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return {
      loadEmbeddedNotePreview: async () => null
    }
  },

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (element) => (element as HTMLElement).getAttribute('data-target') ?? ''
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-note-embed-node="true"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-note-embed-node': 'true',
      'data-target': node.attrs.target,
      contenteditable: 'false'
    })]
  },

  addNodeView() {
    return VueNodeViewRenderer(NoteEmbedNodeView as never)
  }
})
