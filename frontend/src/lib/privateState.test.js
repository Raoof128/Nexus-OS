import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('./opfsDrive', () => ({ clearAllBlobs: vi.fn(() => Promise.resolve(0)) }))

import { claimLocalState, OWNER_KEY } from './privateState'
import { clearAllBlobs } from './opfsDrive'
import { useFileSystemStore } from '../os/stores/fileSystemStore'
import { useWindowStore } from '../os/stores/windowStore'
import { useNotificationStore } from '../os/stores/notificationStore'

function seedUserA() {
  localStorage.setItem('nexus-os:filesystem', '{"files":"A"}')
  localStorage.setItem('nexus-os:window-layout', '{"windows":"A"}')
  localStorage.setItem('nexus-os:note-notes-abc123', 'A private note')
  localStorage.setItem('nexus-os:settings', '{"wallpaper":"aero"}')
  localStorage.setItem('nexus-os:notifications:user-a', '{"notifications":["A task"]}')
  localStorage.setItem('nexus-os:tasks:reminders-fired', '{"t1":1}')
  localStorage.setItem('aion.supabase.auth', '{"refresh_token":"anon-a"}')
  useFileSystemStore.getState().createFile('/documents', 'a-secret.txt', 'A')
  useWindowStore.getState().openApp('notes')
}

describe('claimLocalState', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(clearAllBlobs).mockClear()
    useFileSystemStore.getState().resetFileSystem()
    useWindowStore.getState().closeAll()
  })

  it('claims existing data for the first account without wiping it', () => {
    seedUserA()
    expect(claimLocalState('user-a')).toBe(false)
    expect(localStorage.getItem(OWNER_KEY)).toBe('user-a')
    expect(localStorage.getItem('nexus-os:note-notes-abc123')).toBe('A private note')
    expect(clearAllBlobs).not.toHaveBeenCalled()
  })

  it('keeps everything when the same account signs in again', () => {
    claimLocalState('user-a')
    seedUserA()
    expect(claimLocalState('user-a')).toBe(false)
    expect(localStorage.getItem('nexus-os:filesystem')).not.toBeNull()
    expect(useFileSystemStore.getState().files['/documents/a-secret.txt']).toBeDefined()
  })

  it("wipes the previous account's files, notes and layout for a different account", () => {
    claimLocalState('user-a')
    seedUserA()

    expect(claimLocalState('user-b')).toBe(true)

    // Storage: private keys gone, device preferences kept, owner switched.
    expect(localStorage.getItem('nexus-os:note-notes-abc123')).toBeNull()
    expect(localStorage.getItem('nexus-os:window-layout')).toBeNull()
    expect(localStorage.getItem('nexus-os:settings')).not.toBeNull()
    // Review follow-up: these private keys were left behind.
    expect(localStorage.getItem('nexus-os:notifications:user-a')).toBeNull()
    expect(localStorage.getItem('nexus-os:tasks:reminders-fired')).toBeNull()
    expect(localStorage.getItem('aion.supabase.auth')).toBeNull()
    expect(localStorage.getItem(OWNER_KEY)).toBe('user-b')
    // Memory: same-tab stores no longer hold user A's data.
    expect(useFileSystemStore.getState().files['/documents/a-secret.txt']).toBeUndefined()
    expect(Object.keys(useFileSystemStore.getState().files)).toEqual([
      '/',
      '/documents',
      '/downloads',
    ])
    expect(useWindowStore.getState().windows).toEqual({})
    expect(useNotificationStore.getState().storageUserId).toBeNull()
    expect(clearAllBlobs).toHaveBeenCalledTimes(1)
  })

  it('ignores a missing user id', () => {
    expect(claimLocalState(undefined)).toBe(false)
    expect(localStorage.getItem(OWNER_KEY)).toBeNull()
  })
})
