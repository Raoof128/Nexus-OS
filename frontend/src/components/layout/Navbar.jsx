import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { session, loading, signOut } = useAuth()

  return (
    <nav className="sticky top-0 z-50 isolate w-full border-b border-white/[0.06] bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          {/* Neon logo mark */}
          <div className="relative h-5 w-5" aria-hidden="true">
            <div className="absolute inset-0 rounded bg-primary/80 blur-sm" />
            <div className="relative h-full w-full rounded bg-primary shadow-[0_0_12px_var(--color-primary)]" />
          </div>
          <div className="flex items-center gap-3 glitch-hover">
            <span className="heading-display text-base font-bold text-primary sm:text-lg">
              Nexus
            </span>
            <span className="hidden text-xs text-muted-foreground sm:inline heading-ui">
              // Archive
            </span>
          </div>
        </div>

        {session ? (
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1.5 w-1.5 rounded-full bg-green-400 shadow-[0_0_6px_theme(colors.green.400)]" />
              <span className="text-xs text-muted-foreground">
                {session.user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="heading-ui rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-all hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-4"
            >
              Disconnect
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 heading-ui text-xs">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
            <span className="text-muted-foreground">Awaiting Auth...</span>
          </div>
        ) : null}
      </div>
    </nav>
  )
}
