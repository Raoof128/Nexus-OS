import { useState } from 'react'
import { clearRecoveryTokens, getRecoveryTokens } from '../lib/recoveryTokens'

export function useRecoveryTokens() {
  const [tokens, setTokens] = useState(() => getRecoveryTokens())

  const dismissTokens = () => {
    clearRecoveryTokens()
    setTokens(null)
  }

  return [tokens, dismissTokens]
}
