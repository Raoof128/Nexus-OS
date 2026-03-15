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
      <div className="flex min-h-screen flex-col bg-background font-mono text-foreground relative overflow-hidden">
        {/* Neon Cyber Grid background mock */}
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        
        <Navbar />
        <main className="flex-1 z-10 flex items-center justify-center p-6">
          <form 
            onSubmit={handleLogin} 
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur-xl relative"
          >
            <div className="absolute -inset-1 blur-2xl opacity-20 bg-primary/50 animate-pulse z-[-1]" />
            <h2 className="mb-6 text-2xl font-bold uppercase tracking-wider text-white">System Login</h2>
            
            {authError && (
              <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive font-bold uppercase tracking-wider">
                {authError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase">Identity // Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="runner@nexus.net"
                  required
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase">Passkey // Secret</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-black/50 px-4 py-2 font-mono text-sm text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                  placeholder="••••••••"
                  required
                />
              </div>
              <button
                type="submit"
                className="mt-6 w-full rounded-md bg-primary py-3 text-sm font-bold uppercase shadow-[0_0_15px_var(--color-primary)] transition-all hover:bg-primary/90 hover:shadow-[0_0_25px_var(--color-primary)] text-primary-foreground focus:outline-none"
              >
                Authenticate
              </button>
            </div>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background font-mono text-foreground">
       {/* Background noise texture or grid can go here */}
       <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f10_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f10_1px,transparent_1px)] bg-[size:30px_30px] opacity-50 pointer-events-none"></div>

      <Navbar />
      
      <main className="relative z-10 h-[calc(100vh-64px)] overflow-hidden">
        {dataLoading && books.length === 0 ? (
           <div className="flex h-full items-center justify-center">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
           </div>
        ) : error ? (
           <div className="p-10 text-destructive bg-destructive/10 border-b border-destructive text-center uppercase font-bold tracking-widest">
             Critical API Error: {error}
           </div>
        ) : (
          <BentoGrid>
            {/* The Kanban spans across the bento grid */}
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
