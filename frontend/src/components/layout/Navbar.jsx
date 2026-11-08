import { useAuth } from '../../hooks/useAuth'

// Auth top bar. On the signed-out logon screen there is nothing to show (the
// logon screen carries its own branding), so it renders nothing. It only shows
// a thin Win7-style bar with the account and Log off if a session exists.
export default function Navbar() {
  const { session, signOut } = useAuth()

  if (!session) return null

  return (
    <nav
      className="relative z-10 flex h-9 w-full items-center justify-between gap-3 bg-[#0c2238aa] px-4 text-[12px] text-white [text-shadow:0_1px_3px_#000a]"
      aria-label="Account"
    >
      <span className="truncate">{session.user.email}</span>
      <button type="button" onClick={signOut} className="w7-btn">
        Log off
      </button>
    </nav>
  )
}
