const RECOVERY_PARAM_KEYS = ['type', 'access_token', 'refresh_token', 'token_hash']

let pendingRecoveryTokens = null

function parseRecoveryTokens(params) {
  if (params.get('type') !== 'recovery') return null

  // Standard flow: access_token is directly in the URL
  if (params.get('access_token')) {
    return {
      accessToken: params.get('access_token'),
      refreshToken: params.get('refresh_token') || '',
    }
  }

  // Token hash flow (newer Supabase): token_hash must be exchanged via verifyOtp
  if (params.get('token_hash')) {
    return {
      tokenHash: params.get('token_hash'),
      accessToken: '',
      refreshToken: '',
    }
  }

  return null
}

export function bootstrapRecoveryTokens() {
  const currentUrl = new URL(window.location.href)
  const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''))
  const hashTokens = parseRecoveryTokens(hashParams)

  if (hashTokens) {
    pendingRecoveryTokens = hashTokens
    currentUrl.hash = ''
    window.history.replaceState(
      null,
      '',
      `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
    )
    return hashTokens
  }

  const searchTokens = parseRecoveryTokens(currentUrl.searchParams)
  if (!searchTokens) {
    return null
  }

  pendingRecoveryTokens = searchTokens
  for (const key of RECOVERY_PARAM_KEYS) {
    currentUrl.searchParams.delete(key)
  }
  window.history.replaceState(
    null,
    '',
    `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
  )
  return searchTokens
}

export function getRecoveryTokens() {
  return pendingRecoveryTokens
}

export function clearRecoveryTokens() {
  pendingRecoveryTokens = null
}
