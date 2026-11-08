import { useAuth } from '../../hooks/useAuth'

// Auth top bar. On the signed-out logon screen there is nothing to show (the
// logon screen carries its own branding), so it renders nothing. When a session
// exists (e.g. during password reset) it shows a light Win7 command strip with
// the account and Log off.
export default function Navbar() {
  const { session, signOut } = useAuth()

  if (!session) return null

  return (
    <nav
      className="w7-commandbar relative z-10 h-9 w-full justify-between gap-3 px-4 text-[12px] text-foreground"
      aria-label="Account"
    >
      <span className="truncate">{session.user.email}</span>
      <button type="button" onClick={signOut} className="w7-btn">
        Log off
      </button>
    </nav>
  )
}
