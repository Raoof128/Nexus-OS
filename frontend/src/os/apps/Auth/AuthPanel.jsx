import { useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, KeyRound, LogIn, UserPlus } from 'lucide-react'
import { authFetch } from '../../../lib/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import PasswordInput from '../../../components/ui/PasswordInput'

const inputClass =
  'w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/40 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary terminal-input'

const labelClass =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground'

const linkClass = 'text-xs text-primary transition-colors hover:text-primary/80 cursor-pointer py-2'

function GlitchLine() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
      <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="absolute top-0 left-1/4 h-full w-20 bg-primary/40 blur-sm animate-[glitch-shift_2s_infinite]" />
    </div>
  )
}

function Alert({ children, id }) {
  if (!children) return null
  return (
    <Motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      id={id}
      role="alert"
      className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold normal-case tracking-wider text-destructive"
    >
      {children}
    </Motion.div>
  )
}

function Success({ children }) {
  if (!children) return null
  return (
    <Motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm font-bold uppercase tracking-wider text-green-400"
    >
      {children}
    </Motion.div>
  )
}

function DecryptText({ text, active }) {
  if (!active) return text
  return (
    <span className="flex items-center justify-center gap-1">
      <span className="decrypt-effect">_</span>
      {text}
      <span className="decrypt-effect">_</span>
    </span>
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
  const [forgotSent, setForgotSent] = useState(false)

  const submittingRef = useRef(false)

  const slideTo = (panel) => {
    setError(null)
    setSuccess(null)
    setForgotSent(false)
    setActive(panel)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    setSubmitting(true)
    try {
      const { error: signInError } = await signIn(loginEmail, loginPassword)
      if (signInError) setError(signInError.message)
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    if (regPassword !== regConfirm) {
      setError('Passwords do not match')
      submittingRef.current = false
      return
    }
    setSubmitting(true)
    try {
      const result = await authFetch('/auth/register', {
        method: 'POST',
        body: { email: regEmail, password: regPassword },
      })
      if (result.user) {
        const { error: loginError } = await signIn(regEmail, regPassword)
        if (loginError) {
          setSuccess('Account created. Please log in.')
          slideTo('login')
        }
      } else {
        setSuccess(result.message || 'Check your email to confirm registration')
      }
    } catch (registerError) {
      setError(registerError.message)
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  const handleForgot = async (event) => {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    setSubmitting(true)
    try {
      await authFetch('/auth/forgot-password', {
        method: 'POST',
        body: { email: forgotEmail },
      })
      setSuccess('If that email exists, a reset link has been sent. Check your inbox.')
      setForgotSent(true)
    } catch (forgotError) {
      setError(forgotError.message)
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  return (
    <div className="neon-border relative w-full overflow-hidden rounded-2xl glass-panel shadow-2xl sm:rounded-[2rem]">
      <div className="absolute -inset-1 -z-10 bg-primary/30 opacity-15 blur-3xl" />
      <GlitchLine />

      {/* Cyber Brackets */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="cyber-bracket cyber-bracket-tl h-full w-full" />
        <div className="cyber-bracket cyber-bracket-tr h-full w-full" />
        <div className="cyber-bracket cyber-bracket-bl h-full w-full" />
        <div className="cyber-bracket cyber-bracket-br h-full w-full" />
      </div>

      <Motion.div
        animate={{ height: 'auto' }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          {active === 'login' && (
            <Motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-5 sm:p-8"
            >
              <div className="mb-1 flex items-center gap-2 text-primary">
                <LogIn size={18} />
                <h2 className="heading-display text-xl font-bold text-white sm:text-2xl">
                  System Login
                </h2>
              </div>
              <p className="mb-6 text-sm text-muted-foreground font-mono">
                [AUTH_REQUIRED] Authenticate to access terminal.
              </p>

              <Alert id="form-error">{error}</Alert>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className={labelClass}>
                    Identity // Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className={inputClass}
                    placeholder="runner@nexus.net"
                    autoComplete="email"
                    required
                    {...(error ? { 'aria-describedby': 'form-error', 'aria-invalid': true } : {})}
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className={labelClass}>
                    Passkey // Secret
                  </label>
                  <PasswordInput
                    id="login-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    {...(error ? { 'aria-describedby': 'form-error', 'aria-invalid': true } : {})}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="heading-ui mt-4 w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:animate-none"
                >
                  <DecryptText
                    text={submitting ? 'Connecting...' : 'Authenticate'}
                    active={submitting}
                  />
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                <button type="button" onClick={() => slideTo('register')} className={linkClass}>
                  <span className="flex items-center gap-1.5">
                    <UserPlus size={12} /> Create account
                  </span>
                </button>
                <button type="button" onClick={() => slideTo('forgot')} className={linkClass}>
                  <span className="flex items-center gap-1.5">
                    <KeyRound size={12} /> Forgot password
                  </span>
                </button>
              </div>
            </Motion.div>
          )}

          {active === 'register' && (
            <Motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-5 sm:p-8"
            >
              <button
                type="button"
                onClick={() => slideTo('login')}
                className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white"
              >
                <ArrowLeft size={14} /> [ESC] Back to login
              </button>

              <div className="mb-1 flex items-center gap-2 text-primary">
                <UserPlus size={18} />
                <h2 className="heading-display text-xl font-bold text-white sm:text-2xl">
                  New Identity
                </h2>
              </div>
              <p className="mb-6 text-sm text-muted-foreground font-mono">
                [REG_INIT] Initializing new user profile.
              </p>

              <Alert id="reg-form-error">{error}</Alert>
              <Success>{success}</Success>

              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="reg-email" className={labelClass}>
                    Identity // Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className={inputClass}
                    placeholder="runner@nexus.net"
                    autoComplete="email"
                    required
                    {...(error
                      ? { 'aria-describedby': 'reg-form-error', 'aria-invalid': true }
                      : {})}
                  />
                </div>
                <div>
                  <label htmlFor="reg-password" className={labelClass}>
                    Passkey // Secret
                  </label>
                  <PasswordInput
                    id="reg-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className={inputClass}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    {...(error
                      ? { 'aria-describedby': 'reg-form-error', 'aria-invalid': true }
                      : {})}
                  />
                </div>
                <div>
                  <label htmlFor="reg-confirm" className={labelClass}>
                    Confirm // Passkey
                  </label>
                  <PasswordInput
                    id="reg-confirm"
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    {...(error
                      ? { 'aria-describedby': 'reg-form-error', 'aria-invalid': true }
                      : {})}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="heading-ui mt-4 w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:animate-none"
                >
                  <DecryptText
                    text={submitting ? 'Initializing...' : 'Create Archive'}
                    active={submitting}
                  />
                </button>
              </form>
            </Motion.div>
          )}

          {active === 'forgot' && (
            <Motion.div
              key="forgot"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-5 sm:p-8"
            >
              <button
                type="button"
                onClick={() => slideTo('login')}
                className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white"
              >
                <ArrowLeft size={14} /> [ESC] Back to login
              </button>

              <div className="mb-1 flex items-center gap-2 text-primary">
                <KeyRound size={18} />
                <h2 className="heading-display text-xl font-bold text-white sm:text-2xl">
                  Reset Passkey
                </h2>
              </div>
              <p className="mb-6 text-sm text-muted-foreground font-mono">
                [RECOVERY_MODE] Requesting link for identity.
              </p>

              <Alert id="forgot-form-error">{error}</Alert>
              <Success>{success}</Success>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className={labelClass}>
                    Identity // Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className={inputClass}
                    placeholder="runner@nexus.net"
                    autoComplete="email"
                    required
                    {...(error
                      ? { 'aria-describedby': 'forgot-form-error', 'aria-invalid': true }
                      : {})}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || forgotSent}
                  className="heading-ui mt-4 w-full rounded-lg bg-primary py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground neon-pulse transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:animate-none"
                >
                  <DecryptText
                    text={
                      submitting
                        ? 'Transmitting...'
                        : forgotSent
                          ? 'Link Sent'
                          : 'Send Recovery Link'
                    }
                    active={submitting}
                  />
                </button>
              </form>
            </Motion.div>
          )}
        </AnimatePresence>
      </Motion.div>
    </div>
  )
}
