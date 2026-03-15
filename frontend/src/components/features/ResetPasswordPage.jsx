import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { authFetch } from '../../lib/apiClient'
import Navbar from '../layout/Navbar'

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50'

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground'

export default function ResetPasswordPage({ accessToken, refreshToken, onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (!accessToken) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background font-mono text-foreground">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        <Navbar />
        <main className="z-10 flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-[2rem] border border-white/10 bg-black/60 p-10 text-center shadow-2xl backdrop-blur-xl">
            <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h2 className="mb-2 text-xl font-bold uppercase tracking-wider text-white">
              Session Expired
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              This recovery link is invalid or has expired. Request a new one.
            </p>
            <button
              type="button"
              onClick={onComplete}
              className="w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90"
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background font-mono text-foreground">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      <Navbar />
      <main className="z-10 flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur-xl">
            <div className="absolute -inset-1 -z-10 bg-primary/40 opacity-20 blur-2xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
            </div>

            <div className="mb-1 flex items-center gap-2 text-primary">
              <KeyRound size={18} />
              <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
                New Passkey
              </h2>
            </div>
            <p className="mb-6 text-sm text-muted-foreground">
              Set your new password to regain access.
            </p>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold uppercase tracking-wider text-destructive"
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
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="mt-4 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] focus:outline-none disabled:opacity-50"
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
