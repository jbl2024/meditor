import { describe, expect, it } from 'vitest'
import { buildPreviewDocumentHtml } from './fileInspectorPreviewHtml'

describe('buildPreviewDocumentHtml', () => {
  it('strips inline style and script tags from preview content and loads shared assets externally', () => {
    const html = buildPreviewDocumentHtml(
      '<html><head><style>body { color: red; }</style></head><body><main>Preview</main><script>console.log("blocked")</script></body></html>',
      { colorScheme: 'dark', vars: { '--text-main': '#f8fafc' } },
      {
        stylesheetUrl: 'https://app.test/fileInspectorPreview.css',
        scriptUrl: 'https://app.test/fileInspectorPreview.js'
      },
      'Preview'
    )

    expect(html).toContain('link rel="stylesheet" href="https://app.test/fileInspectorPreview.css"')
    expect(html).toContain('script src="https://app.test/fileInspectorPreview.js" defer')
    expect(html).toContain('tomosona-preview-theme')
    expect(html).toContain('<main>Preview</main>')
    expect(html).not.toContain('body { color: red; }')
    expect(html).not.toContain('console.log("blocked")')
    expect(html).not.toContain('<style>')
    expect(html).not.toContain('<script>console.log("blocked")</script>')
  })
})
