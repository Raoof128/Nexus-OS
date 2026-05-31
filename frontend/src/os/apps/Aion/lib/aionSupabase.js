import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_AION_SUPABASE_URL
const anonKey = import.meta.env.VITE_AION_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Aion: missing VITE_AION_SUPABASE_URL or VITE_AION_SUPABASE_ANON_KEY. Add them to frontend/.env.',
  )
}

export const aionSupabase = createClient(url, anonKey, {
  auth: {
    storageKey: 'aion.supabase.auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
