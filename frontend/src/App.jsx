import { Loader2 } from 'lucide-react'
import AuthPanel from './os/apps/Auth/AuthPanel'
import ResetPasswordPage from './os/apps/Auth/ResetPasswordPage'
import { UserTile } from './os/apps/Auth/LogonParts'
import { brandClass, bodyTextClass, scrimClass } from './os/apps/Auth/logonStyles'
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
      <p className={scrimClass}>Welcome</p>
      <div className={`flex items-center gap-2 ${bodyTextClass} ${scrimClass}`}>
        <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        <span>Loading…</span>
      </div>
      <span className="sr-only">Loading session</span>
    </div>
  )
}

// Shown when the server could not be reached at boot after quiet retries. Not a
// sign-out: the session cookies are untouched, so Try again can restore it.
function UnreachableScreen({ onRetry }) {
  return (
    <div className="nx-wallpaper-aero relative flex min-h-screen items-center justify-center px-4">
      <div
        role="alert"
        className={`flex max-w-sm flex-col items-center gap-3 text-center ${scrimClass}`}
      >
        <p className={bodyTextClass}>
          Nexus OS can&apos;t reach the server right now. Check your connection, then try again.
        </p>
        <button type="button" className="w7-btn default" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}

// ── Main app ─────────────────────────────────────────────────────────────────

function App() {
  const { session, loading: authLoading, unreachable, retrySession } = useAuth()
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

  if (!session && unreachable) {
    return <UnreachableScreen onRetry={retrySession} />
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
          <h1 className={`${brandClass} ${scrimClass}`}>Nexus OS</h1>
          <div id="auth-panel" className="flex w-full justify-center">
            <AuthPanel />
          </div>
        </main>

        <footer className={`relative z-10 px-4 pb-3 text-right ${bodyTextClass}`}>
          <span className={`inline-block ${scrimClass}`}>
            Nexus OS © {new Date().getFullYear()}
          </span>
        </footer>
      </div>
    )
  }

  return <Desktop />
}

export default App
