import { useEffect, useRef, useState } from 'react'
import { authFetch } from '../../../lib/apiClient'
import { bodyTextClass, headingClass, panelClass } from './logonStyles'

export default function VerifyEmailPage({ token, onComplete }) {
  const [result, setResult] = useState('')
  const verification = useRef(null)

  useEffect(() => {
    let active = true
    verification.current ??= authFetch('/auth/verify-email', {
      method: 'POST',
      headers: { 'x-recovery-access-token': token },
    })
    verification.current.then(
      () => active && setResult('Your email is verified. You can sign in now.'),
      () => active && setResult('This verification link is invalid or has expired.'),
    )
    return () => {
      active = false
    }
  }, [token])

  return (
    <main className="nx-wallpaper-aero flex min-h-screen items-center justify-center p-4">
      <section className={panelClass}>
        <h1 className={headingClass}>Verify your email</h1>
        <p role="status" className={bodyTextClass}>
          {result || 'Verifying your email…'}
        </p>
        <button className="w7-btn default mt-4" type="button" onClick={onComplete}>
          Back to sign in
        </button>
      </section>
    </main>
  )
}
