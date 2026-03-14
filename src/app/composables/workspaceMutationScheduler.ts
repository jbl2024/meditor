/**
 * Module: workspaceMutationScheduler
 *
 * Owns deferred follow-up work for workspace path mutations so immediate UI
 * patches can finish before non-critical refreshes run.
 */

export type WorkspaceMutationScheduler = {
  schedule: <T>(task: () => Promise<T> | T) => Promise<T>
}

type CreateWorkspaceMutationSchedulerOptions = {
  yieldToBrowser?: () => Promise<void>
}

/**
 * Creates a sequential deferred-task scheduler for post-mutation follow-up
 * work. Each task runs after one browser-yield so rename/move feedback can
 * paint before derived refreshes start.
 */
export function createWorkspaceMutationScheduler(
  options: CreateWorkspaceMutationSchedulerOptions = {}
): WorkspaceMutationScheduler {
  const yieldToBrowser = options.yieldToBrowser ?? (() => new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  }))

  let queue = Promise.resolve()

  function schedule<T>(task: () => Promise<T> | T): Promise<T> {
    const run = queue.catch(() => undefined).then(async () => {
      await yieldToBrowser()
      return await task()
    })
    queue = run.then(() => undefined, () => undefined)
    return run
  }

  return { schedule }
}
