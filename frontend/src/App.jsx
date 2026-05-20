import { BookOpen, Briefcase, Film, Sparkles } from 'lucide-react'
import AuthPanel from './os/apps/Auth/AuthPanel'
import ResetPasswordPage from './os/apps/Auth/ResetPasswordPage'
import Navbar from './components/layout/Navbar'
import Desktop from './os/Desktop'
import { useAuth } from './hooks/useAuth'
import { useRecoveryTokens } from './hooks/useRecoveryTokens'

// ── Feature category items shown on the login hero ───────────────────────────
const FEATURES = [
  { label: 'Books', Icon: BookOpen },
  { label: 'Movies', Icon: Film },
  { label: 'Anime', Icon: Sparkles },
  { label: 'Jobs', Icon: Briefcase },
]

// ── Branded loading screen ───────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background"
      role="status"
      aria-label="Loading Nexus OS"
    >
      <div className="ambient-orbs" />
      <div className="scanlines" />

      {/* Subtle background mesh */}
      <div className="pointer-events-none absolute inset-0 -z-1 opacity-30 wallpaper-mesh" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* N logo mark */}
        <div className="relative">
          {/* Outer glow ring */}
          <div
            className="absolute -inset-4 rounded-2xl opacity-20 blur-2xl"
            style={{ background: 'hsl(var(--neon-yellow))' }}
          />
          {/* Logo box */}
          <div
            className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-primary/40 bg-black/90"
            style={{
              boxShadow:
                '0 0 24px hsl(var(--neon-yellow)/0.3), 0 0 64px hsl(var(--neon-yellow)/0.1), inset 0 0 16px hsl(var(--neon-yellow)/0.05)',
            }}
          >
            {/* Corner marks */}
            <span
              className="pointer-events-none absolute left-[5px] top-[5px] block h-2 w-2"
              style={{
                borderTop: '1px solid hsl(170 76% 63% / 0.6)',
                borderLeft: '1px solid hsl(170 76% 63% / 0.6)',
              }}
            />
            <span
              className="pointer-events-none absolute bottom-[5px] right-[5px] block h-2 w-2"
              style={{
                borderBottom: '1px solid hsl(170 76% 63% / 0.6)',
                borderRight: '1px solid hsl(170 76% 63% / 0.6)',
              }}
            />
            <span
              className="heading-display select-none font-black"
              style={{
                fontSize: '2.5rem',
                lineHeight: 1,
                color: 'hsl(var(--neon-yellow))',
                textShadow: '0 0 20px hsl(var(--neon-yellow)/0.8)',
              }}
            >
              N
            </span>
          </div>
        </div>

        {/* Brand + status */}
        <div className="flex flex-col items-center gap-2">
          <span className="heading-display text-sm font-bold tracking-[0.35em] text-white/80 uppercase">
            Nexus OS
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.2em] text-primary/50 uppercase">
              Authenticating
            </span>
            {/* Animated dots */}
            <span className="flex gap-0.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="inline-block h-1 w-1 rounded-full bg-primary/50 animate-pulse"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </div>
        </div>

        {/* Horizontal neon line */}
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
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
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
        {/* Skip link for keyboard/screen-reader users */}
        <a
          href="#auth-panel"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground"
        >
          Skip to login
        </a>

        {/* Background layers */}
        <div className="ambient-orbs" />
        <div className="scanlines" />
        {/* Subtle grid — stays even with wallpaper presets removed, it's decorative on the auth page */}
        <div className="pointer-events-none absolute inset-0 -z-1 bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.025)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.025)_1px,transparent_1px)] bg-[size:44px_44px]" />
        {/* Radial vignette — pulls focus to the centre */}
        <div className="pointer-events-none absolute inset-0 -z-1 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,transparent_30%,hsl(0_0%_0%/0.6)_100%)]" />

        <Navbar />

        <main className="relative z-10 flex flex-1 items-center justify-center p-4 sm:p-6 lg:p-8">
          <div className="grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
            {/* ── Hero ─────────────────────────────────────────────── */}
            <section className="neon-border glass-panel relative flex flex-col justify-center overflow-hidden rounded-2xl p-6 shadow-2xl sm:rounded-[2rem] sm:p-8 lg:p-10">
              {/* Top accent scan line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--neon-yellow)/0.4)]" />

              {/* All four cyber brackets */}
              <div className="cyber-bracket cyber-bracket-tl" />
              <div className="cyber-bracket cyber-bracket-tr" />
              <div className="cyber-bracket cyber-bracket-bl" />
              <div className="cyber-bracket cyber-bracket-br" />

              {/* Eyebrow label */}
              <div className="mb-4 flex items-center gap-2">
                <span className="h-px w-6 bg-primary/50" />
                <p className="heading-ui text-[10px] font-semibold uppercase tracking-[0.45em] text-primary sm:text-[11px]">
                  Personal Media Vault
                </p>
              </div>

              {/* Headline */}
              <h1 className="heading-display max-w-xl text-3xl font-black leading-[1.05] text-white sm:text-4xl md:text-5xl lg:text-[3.25rem]">
                One archive for{' '}
                <span
                  className="text-primary"
                  style={{ textShadow: '0 0 24px hsl(var(--neon-yellow)/0.4)' }}
                >
                  everything
                </span>{' '}
                you care about.
              </h1>

              {/* Sub-copy */}
              <p className="mt-5 max-w-lg text-sm leading-[1.75] text-muted-foreground sm:mt-6 md:text-[15px]">
                Replace scattered lists with one identity-driven dashboard. Track what you finished,
                what you&apos;re pursuing now, and the notes that matter.
              </p>

              {/* Feature items — terminal style */}
              <div className="mt-7 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 lg:grid-cols-4">
                {FEATURES.map(({ label, Icon }) => (
                  <div
                    key={label}
                    className="group flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-3 transition-all hover:border-primary/25 hover:bg-primary/[0.06] hover:shadow-[0_0_12px_hsl(var(--neon-yellow)/0.08)] sm:py-4"
                  >
                    <Icon
                      size={13}
                      className="shrink-0 text-primary/60 transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                    <span className="heading-ui text-[10px] font-semibold uppercase tracking-wider text-white/60 transition-colors group-hover:text-white/90 sm:text-[11px]">
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Bottom accent */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            </section>

            {/* ── Auth panel ───────────────────────────────────────── */}
            <div id="auth-panel" className="flex w-full flex-col justify-center">
              {/* Mobile brand header — shown below lg */}
              <div className="mb-5 flex items-center justify-center gap-3 lg:hidden">
                {/* Mini N logo */}
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/40 bg-black/80"
                  style={{ boxShadow: '0 0 10px hsl(var(--neon-yellow)/0.25)' }}
                >
                  <span
                    className="heading-display select-none font-black"
                    style={{
                      fontSize: '0.95rem',
                      lineHeight: 1,
                      color: 'hsl(var(--neon-yellow))',
                      textShadow: '0 0 8px hsl(var(--neon-yellow)/0.7)',
                    }}
                  >
                    N
                  </span>
                </div>
                <span className="heading-display text-base font-bold tracking-[0.2em] text-white/70 uppercase">
                  Nexus OS
                </span>
              </div>

              <AuthPanel />
            </div>
          </div>
        </main>

        <footer className="relative z-10 py-5 text-center font-mono text-[10px] tracking-wider text-muted-foreground/25">
          <div className="mb-2 h-px w-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
          Nexus OS &copy; {new Date().getFullYear()} // v2.1.0
        </footer>
      </div>
    )
  }

  return <Desktop />
}

export default App
