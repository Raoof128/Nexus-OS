import { describe, it, expect, beforeEach, vi } from 'vitest'

// Reset module between tests so lockCount starts at 0 each time.
async function freshLockScroll() {
  vi.resetModules()
  return (await import('./scrollLock')).lockScroll
}

beforeEach(() => {
  document.body.style.overflow = ''
})

describe('lockScroll', () => {
  it('sets overflow:hidden on the body when first lock is acquired', async () => {
    const lockScroll = await freshLockScroll()
    const unlock = lockScroll()
    expect(document.body.style.overflow).toBe('hidden')
    unlock()
  })

  it('restores overflow after the lock is released', async () => {
    const lockScroll = await freshLockScroll()
    const unlock = lockScroll()
    unlock()
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps body locked while multiple locks are active (reference counting)', async () => {
    const lockScroll = await freshLockScroll()
    const unlock1 = lockScroll()
    const unlock2 = lockScroll()
    unlock1()
    expect(document.body.style.overflow).toBe('hidden')
    unlock2()
    expect(document.body.style.overflow).toBe('')
  })

  it('returns a different unlock function each call', async () => {
    const lockScroll = await freshLockScroll()
    const u1 = lockScroll()
    const u2 = lockScroll()
    expect(u1).not.toBe(u2)
    u1()
    u2()
  })

  it('does not go below 0 on extra unlock calls (guard against double-release)', async () => {
    const lockScroll = await freshLockScroll()
    const unlock = lockScroll()
    unlock()
    expect(() => unlock()).not.toThrow()
    expect(document.body.style.overflow).toBe('')
  })
})
