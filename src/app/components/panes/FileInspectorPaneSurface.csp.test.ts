import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('FileInspectorPaneSurface CSP contract', () => {
  it('allows inline preview styles and scripts in the production CSP', () => {
    const csp = JSON.parse(
      readFileSync(`${process.cwd()}/src-tauri/tauri.conf.json`, 'utf8')
    ).app.security.csp as string

    expect(csp).toContain("frame-src 'self' data:")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("frame-src 'none'")
  })
})
