import { afterEach, describe, expect, it } from 'vitest'
import {
  bootstrapRecoveryTokens,
  clearRecoveryTokens,
  getRecoveryTokens,
} from './recoveryTokens'

afterEach(() => {
  window.history.replaceState({}, '', '/')
  clearRecoveryTokens()
})

describe('recoveryTokens', () => {
  it('captures and scrubs recovery tokens from the URL hash', () => {
    window.history.replaceState(
      {},
      '',
      '/#type=recovery&access_token=hash-token&refresh_token=hash-refresh',
    )

    const tokens = bootstrapRecoveryTokens()

    expect(tokens).toEqual({
      accessToken: 'hash-token',
      refreshToken: 'hash-refresh',
    })
    expect(window.location.hash).toBe('')
    expect(getRecoveryTokens()).toEqual(tokens)
  })

  it('captures and scrubs recovery tokens from the query string', () => {
    window.history.replaceState(
      {},
      '',
      '/?type=recovery&access_token=query-token&refresh_token=query-refresh',
    )

    const tokens = bootstrapRecoveryTokens()

    expect(tokens).toEqual({
      accessToken: 'query-token',
      refreshToken: 'query-refresh',
    })
    expect(window.location.search).toBe('')
    expect(getRecoveryTokens()).toEqual(tokens)
  })
})
