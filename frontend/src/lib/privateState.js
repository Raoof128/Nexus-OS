/**
 * Browser-local data that belongs to one Nexus account.
 *
 * The File Manager tree, its OPFS blobs, note bodies and the window layout are
 * stored in this browser, not on the server. Without an owner, the next account
 * to sign in on the same browser would see the previous account's files and
 * notes. Device preferences (wallpaper, window colour, UI scale) are not
 * private and are kept.
 *
 * claimLocalState(userId) records the owner. If a *different* account signs
 * in, the private data is wiped from storage and from memory before any store
 * hydrates. The same account keeps everything across sign-outs. Data written
 * before owners were recorded is claimed by the first account that signs in.
 */
import { clearAllBlobs } from './opfsDrive'
import { useFileSystemStore } from '../os/stores/fileSystemStore'
import { useWindowStore } from '../os/stores/windowStore'
import { useNotificationStore } from '../os/stores/notificationStore'

export const OWNER_KEY = 'nexus-os:owner'
const PRIVATE_KEYS = ['nexus-os:filesystem', 'nexus-os:window-layout']
// Note bodies (per window today, per note in future) and anything else note-scoped.
const PRIVATE_PREFIXES = ['nexus-os:note-', 'nexus-os:notes:']

function readOwner() {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

function writeOwner(userId) {
  try {
    localStorage.setItem(OWNER_KEY, userId)
  } catch {
    // Storage blocked: nothing persists, so there is nothing to protect either.
  }
}

/** Remove the previous owner's private data from storage and memory. */
export function wipePrivateLocalState() {
  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key) continue
      if (PRIVATE_KEYS.includes(key) || PRIVATE_PREFIXES.some((p) => key.startsWith(p))) {
        doomed.push(key)
      }
    }
    doomed.forEach((key) => localStorage.removeItem(key))
  } catch {
    // Storage unavailable — in-memory reset below still applies.
  }
  // Stores keep their last state in memory across sign-out in the same tab.
  useFileSystemStore.getState().resetFileSystem()
  useWindowStore.getState().closeAll()
  useNotificationStore.getState().resetPrivateState()
  // Fire and forget: blobs are unreachable once the tree above is reset.
  void clearAllBlobs()
}

/**
 * Claim browser-local data for `userId`. Returns true when the previous
 * owner's data was wiped. Call before any store hydrates.
 */
export function claimLocalState(userId) {
  if (typeof userId !== 'string' || !userId) return false
  const owner = readOwner()
  const wiped = Boolean(owner) && owner !== userId
  if (wiped) wipePrivateLocalState()
  writeOwner(userId)
  return wiped
}
