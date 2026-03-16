import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock
}))

import { sendSecondBrainMessage } from './secondBrainIpcApi'

describe('secondBrainIpcApi', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('wraps string invoke failures into Error instances', async () => {
    invokeMock.mockRejectedValueOnce('Model request failed: unauthorized')

    await expect(sendSecondBrainMessage({
      session_id: 's1',
      mode: 'freestyle',
      message: 'hello'
    })).rejects.toThrow('Model request failed: unauthorized')
  })

  it('preserves existing Error failures', async () => {
    invokeMock.mockRejectedValueOnce(new Error('Model stream failed: timeout'))

    await expect(sendSecondBrainMessage({
      session_id: 's1',
      mode: 'freestyle',
      message: 'hello'
    })).rejects.toThrow('Model stream failed: timeout')
  })
})
