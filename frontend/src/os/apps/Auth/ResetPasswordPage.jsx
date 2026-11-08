import { useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authFetch } from '../../../lib/apiClient'
import Navbar from '../../../components/layout/Navbar'
import PasswordInput from '../../../components/ui/PasswordInput'
import { FormBalloon, UserTile } from './LogonParts'
import { PASSWORDS_MISMATCH } from './copy'
import {
  bodyTextClass,
  brandClass,
  fieldClass,
  headingClass,
  labelClass,
  panelClass,
  scrimClass,
} from './logonStyles'

// Exchanges the emailed token_hash on an isolated, non-persistent Supabase client
// (lib/realtimeClient.js). The Supabase module loads only when a recovery link is
// opened. A rejected link rejects this promise.
function exchangeRecoveryToken(tokenHash) {
  return import('../../../lib/realtimeClient')
    .then(({ verifyRecoveryOtp }) => verifyRecoveryOtp(tokenHash))
    .then(({ data, error }) => {
      if (error || !data?.session?.access_token) {
        throw new Error('Recovery link is invalid or has expired.')
      }
      return data.session
    })
}

export default function ResetPasswordPage({
  accessToken: initialAccessToken,
  refreshToken: initialRefreshToken,
  tokenHash,
  onComplete,
}) {
  const [accessToken, setAccessToken] = useState(initialAccessToken || '')
  const [refreshToken, setRefreshToken] = useState(initialRefreshToken || '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [exchanging, setExchanging] = useState(Boolean(tokenHash && !initialAccessToken))
  // Explicit: a rejected or expired link must never fall through to the form.
  const [expired, setExpired] = useState(false)
  // One exchange per link, shared by the StrictMode double effect (a second
  // verify of a consumed token would wrongly report the link as expired).
  const exchangeRef = useRef(null)

  // Escape cancels when the form is active
  useEffect(() => {
    if (!accessToken || exchanging) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onComplete()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [accessToken, exchanging, onComplete])

  // Exchange token_hash for a session (isolated client, see exchangeRecoveryToken)
  useEffect(() => {
    if (!tokenHash || accessToken) return
    let cancelled = false
    if (!exchangeRef.current) exchangeRef.current = exchangeRecoveryToken(tokenHash)
    exchangeRef.current
      .then((session) => {
        if (cancelled) return
        setAccessToken(session.access_token)
        setRefreshToken(session.refresh_token || '')
        setExchanging(false)
      })
      .catch(() => {
        if (cancelled) return
        setExpired(true)
        setExchanging(false)
      })
    return () => {
      cancelled = true
    }
  }, [tokenHash, accessToken])

  // Editing a field clears the message it may have caused.
  const typed = (setter) => (event) => {
    setter(event.target.value)
    setError(null)
  }

  if (exchanging) {
    return (
      <div
        className={`nx-wallpaper-aero flex min-h-screen flex-col items-center justify-center gap-3 ${bodyTextClass}`}
        role="status"
      >
        <Loader2 size={24} className="animate-spin" aria-hidden="true" />
        <span className={scrimClass}>Verifying recovery link…</span>
      </div>
    )
  }

  if (expired || (!accessToken && !tokenHash)) {
    return (
      <div className="nx-wallpaper-aero relative flex min-h-screen flex-col">
        <Navbar />
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
          <UserTile />
          <h1 className={`${brandClass} ${scrimClass}`}>Nexus OS</h1>
          <Motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${panelClass} text-center`}
          >
            <h2 className={headingClass}>Reset link expired</h2>
            <p className={`${bodyTextClass} mb-4`}>
              This recovery link is invalid or has expired. Request a new one from the sign-in
              screen.
            </p>
            <div className="flex justify-center">
              <button type="button" onClick={onComplete} className="w7-btn default">
                Back to sign in
              </button>
            </div>
          </Motion.div>
        </main>
      </div>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    setError(null)

    if (password !== confirm) {
      setError(PASSWORDS_MISMATCH)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    try {
      await authFetch('/auth/reset-password', {
        method: 'POST',
        headers: {
          'x-recovery-access-token': accessToken,
          'x-recovery-refresh-token': refreshToken || '',
        },
        body: {
          new_password: password,
        },
      })
      window.location.href = '/'
    } catch (resetError) {
      setError(resetError.message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="nx-wallpaper-aero relative flex min-h-screen flex-col">
      <Navbar />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
        <UserTile />
        <h1 className={`${brandClass} ${scrimClass}`}>Nexus OS</h1>
        <Motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
          className={panelClass}
        >
          <h2 className={headingClass}>Reset your password</h2>

          <FormBalloon id="reset-error">{error}</FormBalloon>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label htmlFor="new-password" className={labelClass}>
                New password
              </label>
              <PasswordInput
                id="new-password"
                wrapperClassName="w-full"
                value={password}
                onChange={typed(setPassword)}
                className={fieldClass}
                placeholder="Min 12 characters"
                autoComplete="new-password"
                minLength={12}
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className={labelClass}>
                Confirm password
              </label>
              <PasswordInput
                id="confirm-password"
                wrapperClassName="w-full"
                value={confirm}
                onChange={typed(setConfirm)}
                className={fieldClass}
                placeholder="Repeat password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </div>
            {/* Windows order: default action first, then Cancel. Esc also cancels. */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="submit" disabled={submitting} className="w7-btn default">
                {submitting ? 'Saving…' : 'Set new password'}
              </button>
              <button type="button" onClick={onComplete} className="w7-btn">
                Cancel
              </button>
            </div>
          </form>
        </Motion.div>
      </main>
    </div>
  )
}
