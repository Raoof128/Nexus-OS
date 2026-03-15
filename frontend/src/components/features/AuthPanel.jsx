import { useRef, useState } from 'react'
import { ArrowLeft, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { authFetch } from '../../lib/apiClient'
import { useAuth } from '../../hooks/useAuth'

const PANELS = { login: 0, register: 1, forgot: 2 }

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50'

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground'

const linkClass = 'text-xs text-primary transition-colors hover:text-primary/80 cursor-pointer'

function GlitchLine() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
      <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
    </div>
  )
}

function Alert({ children }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold uppercase tracking-wider text-destructive"
    >
      {children}
    </div>
  )
}

function Success({ children }) {
  if (!children) return null
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm font-bold uppercase tracking-wider text-green-400"
    >
      {children}
    </div>
  )
}

export default function AuthPanel() {
  const { signIn } = useAuth()
  const [active, setActive] = useState('login')

  // Persisted form state across slides
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')

  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const panelRef = useRef(null)

  const slideTo = (panel) => {
    setError(null)
    setSuccess(null)
    setActive(panel)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(loginEmail, loginPassword)
    if (signInError) setError(signInError.message)
    setSubmitting(false)
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    setError(null)
    if (regPassword !== regConfirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      const result = await authFetch('/auth/register', {
        method: 'POST',
        body: { email: regEmail, password: regPassword },
      })
      if (result.user) {
        window.location.reload()
      } else {
        setSuccess(result.message || 'Check your email to confirm registration')
      }
    } catch (registerError) {
      setError(registerError.message)
    }
    setSubmitting(false)
  }

  const handleForgot = async (event) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await authFetch('/auth/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail },
      })
      setSuccess('If that email exists, a reset link has been sent. Check your inbox.')
    } catch (forgotError) {
      setError(forgotError.message)
    }
    setSubmitting(false)
  }

  const offset = PANELS[active]

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black/60 shadow-2xl backdrop-blur-xl">
      <div className="absolute -inset-1 -z-10 bg-primary/40 opacity-20 blur-2xl" />
      <GlitchLine />

      <div
        ref={panelRef}
        className="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: `translateX(-${offset * 100}%)` }}
      >
        {/* ═══ LOGIN PANEL ═══ */}
        <div className="w-full shrink-0 p-8">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <LogIn size={18} />
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              System Login
            </h2>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Authenticate to load your private catalog.
          </p>

          <Alert>{active === 'login' ? error : null}</Alert>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className={labelClass}>Identity // Email</label>
              <input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className={inputClass}
                placeholder="runner@nexus.net"
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className={labelClass}>Passkey // Secret</label>
              <input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] focus:outline-none disabled:opacity-50"
            >
              {submitting ? 'Connecting...' : 'Authenticate'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
            <button type="button" onClick={() => slideTo('register')} className={linkClass}>
              <span className="flex items-center gap-1.5"><UserPlus size={12} /> Create account</span>
            </button>
            <button type="button" onClick={() => slideTo('forgot')} className={linkClass}>
              <span className="flex items-center gap-1.5"><KeyRound size={12} /> Forgot password</span>
            </button>
          </div>
        </div>

        {/* ═══ REGISTER PANEL ═══ */}
        <div className="w-full shrink-0 p-8">
          <button
            type="button"
            onClick={() => slideTo('login')}
            className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white"
          >
            <ArrowLeft size={14} /> Back to login
          </button>

          <div className="mb-1 flex items-center gap-2 text-primary">
            <UserPlus size={18} />
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              New Identity
            </h2>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Register to create your personal archive.
          </p>

          <Alert>{active === 'register' ? error : null}</Alert>
          <Success>{active === 'register' ? success : null}</Success>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="reg-email" className={labelClass}>Identity // Email</label>
              <input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className={inputClass}
                placeholder="runner@nexus.net"
                required
              />
            </div>
            <div>
              <label htmlFor="reg-password" className={labelClass}>Passkey // Secret</label>
              <input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={inputClass}
                placeholder="Min 8 characters"
                minLength={8}
                required
              />
            </div>
            <div>
              <label htmlFor="reg-confirm" className={labelClass}>Confirm // Passkey</label>
              <input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
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
              {submitting ? 'Initializing...' : 'Create Archive'}
            </button>
          </form>
        </div>

        {/* ═══ FORGOT PASSWORD PANEL ═══ */}
        <div className="w-full shrink-0 p-8">
          <button
            type="button"
            onClick={() => slideTo('login')}
            className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white"
          >
            <ArrowLeft size={14} /> Back to login
          </button>

          <div className="mb-1 flex items-center gap-2 text-primary">
            <KeyRound size={18} />
            <h2 className="text-2xl font-bold uppercase tracking-wider text-white">
              Reset Passkey
            </h2>
          </div>
          <p className="mb-6 text-sm text-muted-foreground">
            Enter your identity to receive a recovery link.
          </p>

          <Alert>{active === 'forgot' ? error : null}</Alert>
          <Success>{active === 'forgot' ? success : null}</Success>

          <form onSubmit={handleForgot} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className={labelClass}>Identity // Email</label>
              <input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className={inputClass}
                placeholder="runner@nexus.net"
                required
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-4 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] focus:outline-none disabled:opacity-50"
            >
              {submitting ? 'Transmitting...' : 'Send Recovery Link'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
