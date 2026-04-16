import { Loader2 } from 'lucide-react'
import AuthPanel from './components/features/AuthPanel'
import ResetPasswordPage from './components/features/ResetPasswordPage'
import Navbar from './components/layout/Navbar'
import Desktop from './os/Desktop'
import { useAuth } from './hooks/useAuth'
import { useRecoveryTokens } from './hooks/useRecoveryTokens'

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" role="status">
        <div className="ambient-orbs" />
        <div className="scanlines" />
        <Loader2 className="relative z-10 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading session</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
        <a href="#auth-panel" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground">
          Skip to login
        </a>
        <div className="ambient-orbs" />
        <div className="scanlines" />
        <div className="pointer-events-none absolute inset-0 -z-1 bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

        <Navbar />
        <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="grid w-full max-w-6xl gap-6 sm:gap-8 md:grid-cols-[1.2fr_0.8fr]">
            <section className="neon-border glass-panel rounded-2xl p-6 shadow-2xl order-2 hidden md:block sm:rounded-[2rem] sm:p-8 lg:p-10">
              <p className="heading-ui mb-3 text-xs font-semibold uppercase tracking-[0.4em] text-primary">
                personal media vault
              </p>
              <h1 className="heading-display max-w-3xl text-2xl font-black text-white md:text-3xl lg:text-5xl xl:text-6xl">
                One archive for everything you care about.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:mt-6 md:text-base">
                Nexus Archive replaces scattered lists with one identity-driven
                dashboard. Track books, movies, anime, and job applications — what
                you finished, what you are pursuing now, and the notes that matter.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4">
                {['Books', 'Movies', 'Anime', 'Jobs'].map((label) => (
                  <div
                    key={label}
                    className="neon-border glass-panel rounded-xl px-4 py-4 heading-ui text-sm font-semibold uppercase tracking-wider text-white/80 sm:py-5"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <div id="auth-panel" className="relative z-10 order-1 md:order-2 w-full max-w-md mx-auto md:max-w-none">
              <p className="heading-display mb-6 text-center text-lg font-bold text-white truncate md:hidden">
                Nexus Archive
              </p>
              <AuthPanel />
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-4 text-center font-mono text-[10px] tracking-wider text-muted-foreground/50">
          Nexus Archive — {new Date().getFullYear()}
        </footer>
      </div>
    )
  }

  return <Desktop />
}

export default App
