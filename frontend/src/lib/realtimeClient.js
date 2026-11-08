import { createClient } from '@supabase/supabase-js'
import { clearLegacyRealtimeAuthStorage } from './legacyAuthStorage'

// This module pulls in the whole Supabase client. Its only importer is the
// recovery exchange (dynamic import in ResetPasswordPage); the app opens no
// Realtime channels. It must not be statically imported by the eager shell,
// or Supabase lands in the main bundle again.

export { clearLegacyRealtimeAuthStorage }

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_URL')
}

if (!supabaseAnonKey) {
  throw new Error('Missing required environment variable: VITE_SUPABASE_ANON_KEY')
}

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
