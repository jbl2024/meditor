import { describe, expect, it } from 'vitest'
import { createWorkspaceMutationScheduler } from './workspaceMutationScheduler'

describe('createWorkspaceMutationScheduler', () => {
  it('runs deferred tasks in order after yielding', async () => {
    const calls: string[] = []
    const scheduler = createWorkspaceMutationScheduler({
      yieldToBrowser: async () => {
        calls.push('yield')
      }
    })

    const first = scheduler.schedule(async () => {
      calls.push('task-1')
    })
    const second = scheduler.schedule(async () => {
      calls.push('task-2')
    })

    await Promise.all([first, second])

    expect(calls).toEqual(['yield', 'task-1', 'yield', 'task-2'])
  })
})
