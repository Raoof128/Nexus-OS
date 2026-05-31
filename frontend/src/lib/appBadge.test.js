import { describe, it, expect, vi, afterEach } from 'vitest'
import { setAppBadge } from './appBadge'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setAppBadge', () => {
  it('calls navigator.setAppBadge when count > 0', () => {
    const mockSet = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'setAppBadge', {
      value: mockSet,
      writable: true,
      configurable: true,
    })
    setAppBadge(3)
    expect(mockSet).toHaveBeenCalledWith(3)
  })

  it('calls navigator.clearAppBadge when count is 0', () => {
    const mockClear = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: mockClear,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(navigator, 'setAppBadge', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    setAppBadge(0)
    expect(mockClear).toHaveBeenCalled()
  })

  it('no-ops when count > 0 but setAppBadge is unavailable', () => {
    Object.defineProperty(navigator, 'setAppBadge', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    expect(() => setAppBadge(5)).not.toThrow()
  })

  it('no-ops when count is 0 but clearAppBadge is unavailable', () => {
    Object.defineProperty(navigator, 'clearAppBadge', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(navigator, 'setAppBadge', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    expect(() => setAppBadge(0)).not.toThrow()
  })

  it('swallows synchronous errors from the Badging API', () => {
    Object.defineProperty(navigator, 'setAppBadge', {
      get() {
        throw new Error('Permissions denied')
      },
      configurable: true,
    })
    expect(() => setAppBadge(2)).not.toThrow()
  })

  it('attaches .catch() handler to the returned promise', () => {
    const promise = { catch: vi.fn().mockReturnThis() }
    const mockSet = vi.fn().mockReturnValue(promise)
    Object.defineProperty(navigator, 'setAppBadge', {
      value: mockSet,
      writable: true,
      configurable: true,
    })
    setAppBadge(1)
    expect(promise.catch).toHaveBeenCalledWith(expect.any(Function))
  })
})
