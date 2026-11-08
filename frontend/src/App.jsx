import { Loader2 } from 'lucide-react'
import AuthPanel from './os/apps/Auth/AuthPanel'
import ResetPasswordPage from './os/apps/Auth/ResetPasswordPage'
import { UserTile } from './os/apps/Auth/LogonParts'
import { brandClass, bodyTextClass } from './os/apps/Auth/logonStyles'
import Navbar from './components/layout/Navbar'
import Desktop from './os/Desktop'
import { useAuth } from './hooks/useAuth'
import { useRecoveryTokens } from './hooks/useRecoveryTokens'

// ── Loading screen: "Welcome" with a spinner on the Aero wallpaper ───────────
function LoadingScreen() {
  return (
    <div
      className={`nx-wallpaper-aero flex min-h-screen flex-col items-center justify-center gap-3 ${brandClass}`}
      role="status"
      aria-label="Loading Nexus OS"
    >
      <p>Welcome</p>
      <div className={`flex items-center gap-2 ${bodyTextClass}`}>
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        <span>Loading…</span>
      </div>
      <span className="sr-only">Loading session</span>
    </div>
  )
}

// ── Main app ─────────────────────────────────────────────────────────────────

function App() {
  const { session, loading: authLoading } = useAuth()
  const [recoveryTokens, dismissTokens] = useRecoveryTokens()

  if (recoveryTokens) {
    return (
      <ResetPasswordPage
        accessToken={recoveryTokens.accessToken}
        refreshToken={recoveryTokens.refreshToken}
        tokenHash={recoveryTokens.tokenHash}
        onComplete={dismissTokens}
      />
    )
  }

  if (authLoading) {
    return <LoadingScreen />
  }

  if (!session) {
    return (
      <div className="nx-wallpaper-aero relative flex min-h-screen flex-col">
        {/* Skip link for keyboard/screen-reader users */}
        <a
          href="#auth-panel"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[3px] focus:bg-white focus:px-3 focus:py-1.5 focus:text-[12px] focus:text-[#1e1e1e]"
        >
          Skip to sign in
        </a>

        <Navbar />

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 px-4 py-8">
          <UserTile />
          <h1 className={brandClass}>Nexus OS</h1>
          <div id="auth-panel" className="flex w-full justify-center">
            <AuthPanel />
          </div>
        </main>

        <footer className={`relative z-10 px-4 pb-3 text-right ${bodyTextClass}`}>
          Nexus OS © {new Date().getFullYear()}
        </footer>
      </div>
    )
  }

  return <Desktop />
}

export default App
