import { useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { authFetch } from '../../../lib/apiClient'
import { useAuth } from '../../../hooks/useAuth'
import PasswordInput from '../../../components/ui/PasswordInput'
import { ArrowSubmitButton, FormBalloon } from './LogonParts'
import { fieldClass, headingClass, labelClass, linkClass, panelClass } from './logonStyles'

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

  // Escape navigates sub-panels back to login
  useEffect(() => {
    if (active === 'login') return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') slideTo('login')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active])

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
    if (regPassword.length < 12) {
      setError('Password must be at least 12 characters.')
      submittingRef.current = false
      return
    }
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

  const fade = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15, ease: 'easeOut' },
  }

  return (
    <div className="relative flex w-full flex-col items-center">
      <Motion.div
        animate={{ height: 'auto' }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full overflow-hidden"
      >
        <AnimatePresence mode="wait" initial={false}>
          {active === 'login' && (
            <Motion.div key="login" {...fade} className="flex flex-col items-center">
              <form onSubmit={handleLogin} className="flex w-[264px] flex-col gap-3">
                <div className="w-[230px]">
                  <label htmlFor="login-email" className={labelClass}>
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className={fieldClass}
                    placeholder="runner@nexus.net"
                    autoComplete="email"
                    required
                    {...(error ? { 'aria-describedby': 'form-error', 'aria-invalid': true } : {})}
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className={labelClass}>
                    Password
                  </label>
                  <div className="flex items-center gap-2">
                    <PasswordInput
                      id="login-password"
                      wrapperClassName="w-[230px]"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className={fieldClass}
                      placeholder="Password"
                      autoComplete="current-password"
                      required
                      {...(error ? { 'aria-describedby': 'form-error', 'aria-invalid': true } : {})}
                    />
                    <ArrowSubmitButton submitting={submitting} />
                  </div>
                </div>
                <FormBalloon id="form-error">{error}</FormBalloon>
              </form>

              <div className="mt-5 flex w-[264px] items-center justify-between">
                <button type="button" onClick={() => slideTo('register')} className={linkClass}>
                  Create an account
                </button>
                <button type="button" onClick={() => slideTo('forgot')} className={linkClass}>
                  Forgot your password?
                </button>
              </div>
            </Motion.div>
          )}

          {active === 'register' && (
            <Motion.div key="register" {...fade} className="flex justify-center">
              <div className={panelClass}>
                <button
                  type="button"
                  onClick={() => slideTo('login')}
                  className={`${linkClass} mb-3 inline-flex items-center gap-1.5`}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> Back to sign in (Esc)
                </button>

                <h2 className={headingClass}>Create an account</h2>

                <FormBalloon id="reg-form-error">{error}</FormBalloon>
                <FormBalloon id="reg-success" tone="success">
                  {success}
                </FormBalloon>

                <form onSubmit={handleRegister} className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="reg-email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={fieldClass}
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
                      Password
                    </label>
                    <PasswordInput
                      id="reg-password"
                      wrapperClassName="w-full"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={fieldClass}
                      placeholder="Min 12 characters"
                      autoComplete="new-password"
                      minLength={12}
                      required
                      {...(error
                        ? { 'aria-describedby': 'reg-form-error', 'aria-invalid': true }
                        : {})}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-confirm" className={labelClass}>
                      Confirm password
                    </label>
                    <PasswordInput
                      id="reg-confirm"
                      wrapperClassName="w-full"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className={fieldClass}
                      placeholder="Repeat password"
                      autoComplete="new-password"
                      minLength={12}
                      required
                      {...(error
                        ? { 'aria-describedby': 'reg-form-error', 'aria-invalid': true }
                        : {})}
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <button type="submit" disabled={submitting} className="w7-btn default">
                      {submitting ? 'Creating account…' : 'Create account'}
                    </button>
                  </div>
                </form>
              </div>
            </Motion.div>
          )}

          {active === 'forgot' && (
            <Motion.div key="forgot" {...fade} className="flex justify-center">
              <div className={panelClass}>
                <button
                  type="button"
                  onClick={() => slideTo('login')}
                  className={`${linkClass} mb-3 inline-flex items-center gap-1.5`}
                >
                  <ArrowLeft size={14} aria-hidden="true" /> Back to sign in (Esc)
                </button>

                <h2 className={headingClass}>Reset your password</h2>
                <p className="mb-3 text-[12px] text-white [text-shadow:0_1px_3px_#000a]">
                  Enter the email for your account and we will send you a reset link.
                </p>

                <FormBalloon id="forgot-form-error">{error}</FormBalloon>
                <FormBalloon id="forgot-success" tone="success">
                  {success}
                </FormBalloon>

                <form onSubmit={handleForgot} className="flex flex-col gap-3">
                  <div>
                    <label htmlFor="forgot-email" className={labelClass}>
                      Email
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className={fieldClass}
                      placeholder="runner@nexus.net"
                      autoComplete="email"
                      required
                      {...(error
                        ? { 'aria-describedby': 'forgot-form-error', 'aria-invalid': true }
                        : {})}
                    />
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={submitting || forgotSent}
                      className="w7-btn default"
                    >
                      {submitting ? 'Sending…' : forgotSent ? 'Link sent' : 'Send reset link'}
                    </button>
                  </div>
                </form>
              </div>
            </Motion.div>
          )}
        </AnimatePresence>
      </Motion.div>
    </div>
  )
}
