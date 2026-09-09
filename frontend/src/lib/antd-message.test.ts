import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
    destroy: vi.fn(),
  },
}))

import { message } from 'antd'
import { toStickyErrorConfig } from './antd-message'

function clickEvent() {
  return {} as Parameters<NonNullable<ReturnType<typeof toStickyErrorConfig>['onClick']>>[0]
}

describe('toStickyErrorConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.mocked(message.destroy).mockReset()
  })

  it('keeps error toasts until click instead of auto-hiding', () => {
    const config = toStickyErrorConfig('Failed to import book')
    expect(config.content).toBe('Failed to import book')
    expect(config.duration).toBe(0)
    expect(config.closable).toBe(true)
    expect(config.className).toContain('app-message-error')
  })

  it('dismisses on click when no text is selected', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => '' } as Selection)
    const config = toStickyErrorConfig('boom')
    config.onClick?.(clickEvent())
    expect(message.destroy).toHaveBeenCalledWith(config.key)
  })

  it('does not dismiss when the user is selecting the error text', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'Failed' } as Selection)
    const config = toStickyErrorConfig('Failed to import book')
    config.onClick?.(clickEvent())
    expect(message.destroy).not.toHaveBeenCalled()
  })
})
