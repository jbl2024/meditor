import { describe, expect, it } from 'vitest'
import htmlNodeViewSource from './HtmlNodeView.vue?raw'

describe('HtmlNodeView style contract', () => {
  it('keeps a minimum preview height so empty html blocks remain editable', () => {
    expect(htmlNodeViewSource).toContain('.tomosona-html-preview')
    expect(htmlNodeViewSource).toContain('min-height: 3.5rem;')
  })
})
