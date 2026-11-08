import { useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../hooks/useAuth'
import PasswordInput from '../../components/ui/PasswordInput'
import { ArrowSubmitButton, FormBalloon, UserTile } from '../apps/Auth/LogonParts'
import { fieldClass } from '../apps/Auth/logonStyles'
import { PASSWORD_INCORRECT } from '../apps/Auth/copy'

const TEXT_SHADOW = '0 1px 2px #000, 0 0 8px #0008'
const FOCUSABLE = 'input:not([disabled]), button:not([disabled])'

/** Lock-screen clock, shown small under the sign-in tile. */
function LockClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return (
    <span
      className="select-none text-[12px] tabular-nums text-white"
      style={{ textShadow: TEXT_SHADOW }}
    >
      {time}
    </span>
  )
}

/**
 * Windows 7 locked screen. Any click or key only wakes it and puts focus in the
 * password box. The session opens only after the password is verified through
 * AuthContext.verifyPassword, which re-checks the credentials with the backend.
 */
export default function LockScreen({ onUnlock }) {
  const { session, signOut, verifyPassword } = useAuth()
  const displayName =
    session?.user?.user_metadata?.full_name || session?.user?.email || 'Nexus OS user'
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const rootRef = useRef(null)
  const passwordRef = useRef(null)

  const dismiss = useCallback(() => {
    if (exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
  }, [])

  const focusPassword = useCallback(() => {
    passwordRef.current?.focus()
  }, [])

  // Focus the password box as soon as the lock appears.
  useEffect(() => {
    focusPassword()
  }, [focusPassword])

  // Wake-on-input: a key pressed while focus is outside the lock (or Escape
  // anywhere) moves focus back to the password box. Escape clears the entry.
  // Nothing here unlocks the session.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPassword('')
        setError(null)
      }
      if (!rootRef.current?.contains(document.activeElement)) focusPassword()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [focusPassword])

  // Keep Tab inside the lock so keyboard focus cannot wander to the desktop.
  const handleRootKeyDown = (event) => {
    if (event.key !== 'Tab' || !rootRef.current) return
    const items = [...rootRef.current.querySelectorAll(FOCUSABLE)]
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  // A click on the lock background wakes it: focus the password box instead of
  // letting the click drop focus to the page.
  const handleRootMouseDown = (event) => {
    if (event.target.closest?.('button, input')) return
    event.preventDefault()
    focusPassword()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submittingRef.current || !password) return
    submittingRef.current = true
    setError(null)
    setSubmitting(true)
    try {
      const verified = await verifyPassword(password)
      setPassword('')
      if (verified) {
        dismiss()
      } else {
        setError(PASSWORD_INCORRECT)
        focusPassword()
      }
    } catch (verifyError) {
      setPassword('')
      setError(verifyError?.message || PASSWORD_INCORRECT)
      focusPassword()
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const handleSwitchUser = () => {
    // Log off: the lock unmounts with the session and the logon screen appears.
    signOut()
  }

  return (
    <AnimatePresence onExitComplete={onUnlock}>
      {!exiting && (
        <Motion.div
          key="lock-screen"
          ref={rootRef}
          className="nx-wallpaper-aero fixed inset-0 flex flex-col items-center justify-center overflow-hidden"
          style={{ zIndex: 2000 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ y: '-100%', opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          role="dialog"
          aria-modal
          aria-label="Lock screen"
          onKeyDown={handleRootKeyDown}
          onMouseDown={handleRootMouseDown}
        >
          {/* Centre sign-in block */}
          <div className="relative flex flex-col items-center gap-3" style={{ zIndex: 5 }}>
            <UserTile />
            <p
              id="lock-user-name"
              className="mt-2 select-none text-[18px] text-white"
              style={{ textShadow: TEXT_SHADOW }}
            >
              {displayName}
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <PasswordInput
                  id="lock-password"
                  ref={passwordRef}
                  wrapperClassName="w-[200px]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete="current-password"
                  required
                  {...(error ? { 'aria-describedby': 'lock-error', 'aria-invalid': true } : {})}
                />
                <ArrowSubmitButton submitting={submitting} label="Unlock" />
              </div>
              <FormBalloon id="lock-error">{error}</FormBalloon>
            </form>
            <p className="select-none text-[12px] text-white" style={{ textShadow: TEXT_SHADOW }}>
              Locked
            </p>
            <LockClock />
          </div>

          {/* Bottom-left actions, as on the Windows 7 lock screen */}
          <div className="absolute bottom-4 left-4 z-10">
            <button type="button" onClick={handleSwitchUser} className="w7-btn">
              Switch User
            </button>
          </div>
        </Motion.div>
      )}
    </AnimatePresence>
  )
}
