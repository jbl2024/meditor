import CodeTool from '@editorjs/code'
import Delimiter from '@editorjs/delimiter'
import Header from '@editorjs/header'
import InlineCode from '@editorjs/inline-code'
import List from '@editorjs/list'
import Paragraph from '@editorjs/paragraph'
import Table from '@editorjs/table'
import CalloutTool from './editorjs/CalloutTool'
import MermaidTool from './editorjs/MermaidTool'
import QuoteTool from './editorjs/QuoteTool'

/**
 * editorTools
 *
 * Provides the EditorJS tools registry used by EditorView. This module keeps the
 * tool wiring isolated so EditorView remains focused on orchestration and lifecycle.
 */

/**
 * Confirmation callback invoked by the Mermaid tool before replacing existing code.
 */
type MermaidReplaceConfirm = (payload: { templateLabel: string }) => Promise<boolean>

/**
 * Creates EditorJS tool configuration used by the note editor.
 */
export function createEditorTools(confirmMermaidReplace: MermaidReplaceConfirm) {
  return {
    paragraph: {
      // EditorJS tool typings are broad/inconsistent across packages; this cast keeps a strongly typed factory surface.
      class: Paragraph as unknown as never,
      inlineToolbar: true,
      config: { preserveBlank: false }
    },
    header: {
      class: Header as unknown as never,
      inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
      config: {
        levels: [1, 2, 3, 4, 5, 6],
        defaultLevel: 2
      }
    },
    list: {
      class: List,
      inlineToolbar: ['bold', 'italic', 'link', 'inlineCode'],
      config: {
        defaultStyle: 'unordered'
      }
    },
    quote: {
      class: QuoteTool as unknown as never,
      inlineToolbar: ['bold', 'italic', 'link', 'inlineCode']
    },
    table: {
      class: Table as unknown as never,
      config: {
        rows: 2,
        cols: 2,
        withHeadings: true
      }
    },
    callout: {
      class: CalloutTool as unknown as never
    },
    mermaid: {
      class: MermaidTool as unknown as never,
      config: {
        confirmReplace: confirmMermaidReplace
      }
    },
    code: CodeTool,
    delimiter: Delimiter,
    inlineCode: InlineCode
  }
}
