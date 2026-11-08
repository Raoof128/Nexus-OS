import { describe, it, expect } from 'vitest'
import { friendlySignInError, LOGON_BAD_PASSWORD } from './signInErrors'

describe('friendlySignInError', () => {
  it('maps the backend credential rejection to the Windows 7 logon copy', () => {
    expect(friendlySignInError('Invalid credentials')).toBe(LOGON_BAD_PASSWORD)
    expect(LOGON_BAD_PASSWORD).toBe('The user name or password is incorrect.')
  })

  it('passes other messages through unchanged', () => {
    expect(friendlySignInError('Request timed out. Please try again.')).toBe(
      'Request timed out. Please try again.',
    )
  })
})
