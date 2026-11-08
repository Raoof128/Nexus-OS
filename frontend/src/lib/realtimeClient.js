import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_ANON_KEY')
}

function getLegacyAuthStorageKey() {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    return projectRef ? `sb-${projectRef}-auth-token` : null
  } catch {
    return null
  }
}

/**
 * Remove credentials written by the Supabase client's historical default auth
 * configuration. The key is derived from this project's configured URL so we
 * never sweep unrelated Supabase applications or other local browser data.
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

// Migrate any credential left by earlier builds before the client initializes.
clearLegacyRealtimeAuthStorage()

const COOKIE_OWNED_AUTH_OPTIONS = {
  // Nexus authentication is owned by HttpOnly backend cookies. Supabase clients
  // must never discover, persist, or refresh a parallel browser-managed session.
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
}

export const realtimeClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: COOKIE_OWNED_AUTH_OPTIONS,
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

/**
 * Exchange a recovery token on a disposable, non-persistent client. Supabase's
 * verifyOtp API records its result in the client session even when persistence
 * is disabled; keeping that session off the long-lived Realtime client ensures
 * it becomes unreachable as soon as this one-shot exchange completes.
 */
export function verifyRecoveryOtp(tokenHash) {
  const recoveryClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: COOKIE_OWNED_AUTH_OPTIONS,
  })
  return recoveryClient.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
}
