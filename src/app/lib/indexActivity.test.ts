import { describe, expect, it } from 'vitest'
import { buildIndexActivityRows, parseIndexLogFields } from './indexActivity'

describe('indexActivity', () => {
  it('parses structured key value fields from backend logs', () => {
    expect(parseIndexLogFields('semantic_edges:refresh_error run_id=4 phase=insert_edge sqlite_code=ConstraintViolation')).toEqual({
      run_id: '4',
      phase: 'insert_edge',
      sqlite_code: 'ConstraintViolation'
    })
  })

  it('reconstructs running semantic refresh activity from start and phase logs', () => {
    const rows = buildIndexActivityRows([
      {
        ts_ms: 1_000,
        message: 'semantic_edges:refresh_start run_id=9 phase=scan_sources sources=12 top_k=3 threshold=0.62'
      },
      {
        ts_ms: 1_100,
        message: 'semantic_edges:refresh_phase run_id=9 phase=query_neighbors source_index=3 source_total=12 source_path=Notes/Projet.md'
      }
    ], (path) => path)

    expect(rows[0]).toMatchObject({
      state: 'running',
      title: 'Refreshing semantic links',
      detail: 'scan 3/12 · Notes/Projet.md'
    })
  })

  it('renders semantic refresh errors with actionable detail', () => {
    const rows = buildIndexActivityRows([
      {
        ts_ms: 1_000,
        message: 'semantic_edges:refresh_start run_id=9 phase=scan_sources sources=12 top_k=3 threshold=0.62'
      },
      {
        ts_ms: 1_100,
        message: 'semantic_edges:refresh_error run_id=9 phase=insert_edge source_path=Notes/Projet.md target_path=Notes/Cible.md sqlite_code=ConstraintViolation sqlite_msg=UNIQUE_constraint_failed'
      }
    ], (path) => path)

    expect(rows[0]).toMatchObject({
      state: 'error',
      title: 'Semantic link refresh failed',
      detail: 'phase insert edge · Notes/Projet.md · target Notes/Cible.md · sqlite ConstraintViolation · UNIQUE constraint failed'
    })
  })
})
