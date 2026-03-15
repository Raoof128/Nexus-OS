import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useBooks } from './hooks/useBooks'
import Navbar from './components/layout/Navbar'
import BentoGrid from './components/layout/BentoGrid'
import KanbanBoard from './components/features/KanbanBoard'
import AICmdPalette from './components/features/AICmdPalette'
import { Loader2 } from 'lucide-react'

function App() {
  const { session, loading: authLoading, signIn } = useAuth()
  const { books, loading: dataLoading, error, fetchBooks } = useBooks(session)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    if (session) {
      fetchBooks()
    }
  }, [session, fetchBooks])

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthError(null)
    const { error } = await signIn(email, password)
    if (error) setAuthError(error.message)
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background font-mono text-foreground">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        <Navbar />
        <main className="z-10 flex flex-1 items-center justify-center p-6">
          <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[2rem] border border-white/10 bg-black/40 p-10 shadow-2xl backdrop-blur-xl">
              <p className="mb-3 text-xs uppercase tracking-[0.4em] text-primary">
                personal media vault
              </p>
              <h1 className="max-w-3xl text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
                One archive for your anime, movies, and books.
              </h1>
              <p className="mt-6 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                Nexus Archive is built to replace scattered watchlists and reading lists
                with one identity-driven dashboard. Track what you finished, what you
                are watching now, what you want to read next, and the notes that make
                your taste personal.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {['Anime tracking', 'Movie watchlists', 'Book notes'].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm uppercase tracking-wider text-white"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <form
              onSubmit={handleLogin}
              className="relative w-full rounded-[2rem] border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur-xl"
            >
              <div className="absolute -inset-1 -z-10 bg-primary/40 opacity-20 blur-2xl" />
              <h2 className="mb-2 text-2xl font-bold uppercase tracking-wider text-white">
                System Login
              </h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Authenticate to load your private catalog and recommendation engine.
              </p>

              {authError && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold uppercase tracking-wider text-destructive">
                  {authError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                    Identity // Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="runner@nexus.net"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                    Passkey // Secret
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="mt-6 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase text-primary-foreground shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] focus:outline-none"
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f10_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f10_1px,transparent_1px)] bg-[size:30px_30px] opacity-50"></div>

      <Navbar />

      <main className="relative z-10 h-[calc(100vh-64px)] overflow-hidden">
        {dataLoading && books.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="border-b border-destructive bg-destructive/10 p-10 text-center font-bold uppercase tracking-widest text-destructive">
            Critical API Error: {error}
          </div>
        ) : (
          <BentoGrid>
            <div className="col-span-1 md:col-span-2 lg:col-span-3 h-[75vh]">
              <KanbanBoard books={books} />
            </div>
          </BentoGrid>
        )}
      </main>

      <AICmdPalette />
    </div>
  )
}

export default App
