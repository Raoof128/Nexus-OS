/**
 * Which account this tab claimed browser-local data for (see privateState.js).
 *
 * Kept free of imports so stores can ask "may I still write?" without an
 * import cycle. A tab that claimed data for account A must stop persisting
 * once another tab signs in as account B, or it would write A's files, notes
 * and layout back over B's wiped storage.
 */
export const OWNER_KEY = 'nexus-os:owner'

let claimedOwner = null

export function setClaimedOwner(userId) {
  claimedOwner = userId || null
}

/** False once another tab has claimed this browser's data for a different account. */
export function ownsLocalState() {
  if (!claimedOwner) return true
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    return !owner || owner === claimedOwner
  } catch {
    return true
  }
}

/** Calls `onLost` when another tab claims the data for a different account. */
export function watchOwner(onLost) {
  if (typeof window === 'undefined') return () => {}
  const handle = (e) => {
    if (e.key !== OWNER_KEY || !claimedOwner) return
    if (e.newValue && e.newValue !== claimedOwner) onLost()
  }
  window.addEventListener('storage', handle)
  return () => window.removeEventListener('storage', handle)
}
