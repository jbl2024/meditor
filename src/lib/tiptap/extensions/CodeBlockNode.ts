import CodeBlock from '@tiptap/extension-code-block'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import CodeBlockNodeView from '../../../components/editor/tiptap/CodeBlockNodeView.vue'

export const CodeBlockNode = CodeBlock.extend({
  addNodeView() {
    return VueNodeViewRenderer(CodeBlockNodeView as never, {
      contentDOMElementTag: 'code'
    })
  }
})
