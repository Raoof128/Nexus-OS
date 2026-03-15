import { useAuth } from '../../hooks/useAuth'

export default function Navbar() {
  const { session, signOut } = useAuth()

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/50 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          {/* Cyberpunk logo placeholder */}
          <div className="h-4 w-4 rounded-sm bg-primary shadow-[0_0_10px_var(--color-primary)]"></div>
          <span className="font-mono text-lg font-bold uppercase tracking-wider text-primary">
            Nexus // Archive
          </span>
        </div>
        
        {session ? (
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground hidden sm:inline-block">
              {session.user.email}
            </span>
            <button
              onClick={signOut}
              className="rounded-md border border-white/10 px-4 py-2 font-mono text-sm uppercase transition-colors hover:bg-white/5 hover:text-white"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 font-mono text-sm">
            <span className="animate-pulse text-muted-foreground">Awaiting Authentication...</span>
          </div>
        )}
      </div>
    </nav>
  )
}
