import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('FileInspectorPaneSurface CSP contract', () => {
  it('keeps html previews on a data url and allows them in the production frame-src policy', () => {
    const csp = JSON.parse(
      readFileSync(join(process.cwd(), 'src-tauri', 'tauri.conf.json'), 'utf8')
    ).app.security.csp as string

    expect(csp).toContain("frame-src 'self' data:")
    expect(csp).not.toContain("frame-src 'none'")
  })
})
