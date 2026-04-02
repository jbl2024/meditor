import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('FileInspectorPaneSurface CSP contract', () => {
  it('preserves inline preview allowances in the production CSP config', () => {
    const config = JSON.parse(
      readFileSync(`${process.cwd()}/src-tauri/tauri.conf.json`, 'utf8')
    ).app.security as {
      csp: string
      dangerousDisableAssetCspModification?: string[]
    }
    const csp = config.csp

    expect(csp).toContain("frame-src 'self' data:")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    expect(csp).not.toContain("frame-src 'none'")
    expect(config.dangerousDisableAssetCspModification).toEqual(['style-src', 'script-src'])
  })
})
