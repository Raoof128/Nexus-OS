const RECOVERY_PARAM_KEYS = ['type', 'access_token', 'refresh_token']

let pendingRecoveryTokens = null

function parseRecoveryTokens(params) {
  if (params.get('type') !== 'recovery' || !params.get('access_token')) {
    return null
  }

  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token') || '',
  }
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
