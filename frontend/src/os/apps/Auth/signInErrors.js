// Maps raw sign-in failures to the Windows 7 logon balloon copy.
// The backend answers a rejected login with detail "Invalid credentials"
// (backend/auth_controller.py); that string never reaches the user.

export const LOGON_BAD_PASSWORD = 'The user name or password is incorrect.'

export function friendlySignInError(message) {
  if (message === 'Invalid credentials') return LOGON_BAD_PASSWORD
  return message
}
