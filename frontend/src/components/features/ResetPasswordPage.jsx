import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { authFetch } from '../../lib/apiClient'
import Navbar from '../layout/Navbar'

const inputClass =
  'w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm text-white transition-all placeholder:text-muted-foreground/30 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20'

const labelClass = 'mb-1.5 block heading-ui text-xs font-semibold uppercase tracking-wider text-muted-foreground'

export default function ResetPasswordPage({ accessToken, refreshToken, onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!accessToken) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
        <div className="ambient-orbs" />
        <div className="scanlines" />
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-cyan)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-cyan)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <Navbar />
        <main className="relative z-10 flex flex-1 items-center justify-center p-6">
          <div className="neon-border glass-panel max-w-md rounded-2xl p-10 text-center shadow-2xl">
            <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-destructive" aria-hidden="true" />
            <h2 className="heading-display mb-2 text-lg font-bold text-white">
              Session Expired
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              This recovery link is invalid or has expired. Request a new one.
            </p>
            <button
              type="button"
              onClick={onComplete}
              className="heading-ui w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Back to Login
            </button>
          </div>
        </main>
      </div>
    )
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)
    try {
      await authFetch('/auth/reset-password', {
        method: 'POST',
        body: {
          access_token: accessToken,
          refresh_token: refreshToken || '',
          new_password: password,
        },
      })
      window.location.href = '/'
    } catch (resetError) {
      setError(resetError.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <div className="ambient-orbs" />
      <div className="scanlines" />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-cyan)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-cyan)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <Navbar />
      <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="neon-border glass-panel overflow-hidden rounded-2xl p-6 shadow-2xl sm:p-8">
            <div className="mb-1 flex items-center gap-2 text-primary">
              <KeyRound size={18} aria-hidden="true" />
              <h2 className="heading-display text-lg font-bold text-white sm:text-xl">
                New Passkey
              </h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Set your new password to regain access.
            </p>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="new-password" className={labelClass}>New Passkey</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Min 8 characters"
                  minLength={8}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className={labelClass}>Confirm Passkey</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputClass}
                  placeholder="Repeat password"
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="heading-ui mt-4 w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:animate-none"
              >
                {submitting ? 'Encrypting...' : 'Set New Passkey'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}
