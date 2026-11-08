// Removes credentials that earlier builds wrote to localStorage through the
// Supabase client's default auth configuration (a refresh token included).
// Kept free of any Supabase import so it can run at boot without pulling the
// Supabase bundle into the main chunk.

function getLegacyAuthStorageKey() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    return projectRef ? `sb-${projectRef}-auth-token` : null
  } catch {
    return null
  }
}

/**
 * The key is derived from this project's configured URL, so we never sweep
 * unrelated Supabase applications or other local browser data.
 */
export function clearLegacyRealtimeAuthStorage(storage) {
  const storageKey = getLegacyAuthStorageKey()
  if (!storageKey) return

  try {
    const targetStorage = storage ?? globalThis.localStorage
    if (!targetStorage) return
    targetStorage.removeItem(storageKey)
    targetStorage.removeItem(`${storageKey}-user`)
    targetStorage.removeItem(`${storageKey}-code-verifier`)
  } catch {
    // Storage may be unavailable in private mode or hardened browser contexts.
  }
}
