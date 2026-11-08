import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

export function useAuthContext() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }

  return context
}

// A blip at boot is retried quietly (after these delays) before the user is
// told the server is unreachable. Mutable so tests can shorten it.
export const BOOT_RETRY_DELAYS_MS = [1000, 3000]
