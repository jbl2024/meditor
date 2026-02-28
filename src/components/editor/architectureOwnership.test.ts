import { describe, expect, it } from 'vitest'
import editorViewSource from '../EditorView.vue?raw'
import blockControlsSource from '../../composables/useBlockMenuControls.ts?raw'
import tableControlsSource from '../../composables/useTableToolbarControls.ts?raw'
import architectureDoc from './ARCHITECTURE.md?raw'

describe('editor architecture ownership guardrails', () => {
  it('keeps lifecycle/table/block ownership composables wired in EditorView', () => {
    expect(editorViewSource).toContain('useEditorSessionLifecycle')
    expect(editorViewSource).toContain('useBlockMenuControls')
    expect(editorViewSource).toContain('useTableToolbarControls')
    expect(editorViewSource).not.toContain('pathLoadToken')
    expect(editorViewSource).not.toContain('tableEdgeTopSeenAt')
  })

  it('avoids no-op overlay forwarding and mega overlay component', () => {
    expect(editorViewSource).not.toContain('EditorFloatingOverlays')
    expect(editorViewSource).not.toContain('@menu-el="() => {}"')
  })

  it('kept composables avoid computed side-effect pattern', () => {
    expect(blockControlsSource).not.toMatch(/computed\([^)]*=>\s*\{[^}]*\.value\s*=/s)
    expect(tableControlsSource).not.toMatch(/computed\([^)]*=>\s*\{[^}]*\.value\s*=/s)
  })

  it('documents ownership map and anti-patterns', () => {
    expect(architectureDoc).toContain('Ownership Map')
    expect(architectureDoc).toContain('Anti-patterns')
    expect(architectureDoc).toContain('useEditorSessionLifecycle')
  })
})
