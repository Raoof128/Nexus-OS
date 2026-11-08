import { useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { authFetch } from '../../../lib/apiClient'
import { realtimeClient } from '../../../lib/realtimeClient'
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
} from './logonStyles'

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

  // Escape cancels when the form is active
  useEffect(() => {
    if (!accessToken || exchanging) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onComplete()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [accessToken, exchanging, onComplete])

  // Exchange token_hash for a session via Supabase verifyOtp
  useEffect(() => {
    if (!tokenHash || accessToken) return
    let cancelled = false
    realtimeClient.auth
      .verifyOtp({ token_hash: tokenHash, type: 'recovery' })
      .then(({ data, error: otpError }) => {
        if (cancelled) return
        if (otpError || !data?.session) {
          setError('Recovery link is invalid or has expired.')
          setExchanging(false)
          return
        }
        setAccessToken(data.session.access_token)
        setRefreshToken(data.session.refresh_token || '')
        setExchanging(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Recovery link is invalid or has expired.')
          setExchanging(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [tokenHash, accessToken])

  if (exchanging) {
    return (
      <div
        className={`nx-wallpaper-aero flex min-h-screen flex-col items-center justify-center gap-3 ${bodyTextClass}`}
        role="status"
      >
        <Loader2 size={24} className="animate-spin" aria-hidden="true" />
        <span>Verifying recovery link…</span>
      </div>
    )
  }

  if (!accessToken && !tokenHash) {
    return (
      <div className="nx-wallpaper-aero relative flex min-h-screen flex-col">
        <Navbar />
        <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
          <UserTile />
          <h1 className={brandClass}>Nexus OS</h1>
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
        <h1 className={brandClass}>Nexus OS</h1>
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
                onChange={(e) => setPassword(e.target.value)}
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
                onChange={(e) => setConfirm(e.target.value)}
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
