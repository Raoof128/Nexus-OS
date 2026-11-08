import { describe, it, expect, beforeEach, vi } from 'vitest'
import { OWNER_KEY, ownsLocalState, setClaimedOwner, watchOwner } from './localOwner'

describe('localOwner', () => {
  beforeEach(() => {
    localStorage.clear()
    setClaimedOwner(null)
  })

  it('allows writes before any account claimed the data', () => {
    expect(ownsLocalState()).toBe(true)
  })

  it('stops writes once another tab claims the data for a different account', () => {
    setClaimedOwner('user-a')
    localStorage.setItem(OWNER_KEY, 'user-a')
    expect(ownsLocalState()).toBe(true)
    localStorage.setItem(OWNER_KEY, 'user-b')
    expect(ownsLocalState()).toBe(false)
  })

  it('reports an owner change from another tab, and ignores other keys', () => {
    setClaimedOwner('user-a')
    const onLost = vi.fn()
    const stop = watchOwner(onLost)
    window.dispatchEvent(new StorageEvent('storage', { key: 'nexus-os:settings', newValue: 'x' }))
    window.dispatchEvent(new StorageEvent('storage', { key: OWNER_KEY, newValue: 'user-a' }))
    expect(onLost).not.toHaveBeenCalled()
    window.dispatchEvent(new StorageEvent('storage', { key: OWNER_KEY, newValue: 'user-b' }))
    expect(onLost).toHaveBeenCalledTimes(1)
    stop()
  })
})
