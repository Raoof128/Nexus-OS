import { useMemo, useState } from 'react'
import { LayoutGroup } from 'framer-motion'
import { BookOpen, Film, Loader2, Sparkles } from 'lucide-react'
import AddMediaDialog from './components/features/AddBookDialog'
import AuthPanel from './components/features/AuthPanel'
import LazyAICmdPalette from './components/features/LazyAICmdPalette'
import MediaDetailModal from './components/features/MediaDetailModal'
import ResetPasswordPage from './components/features/ResetPasswordPage'
import KanbanBoard from './components/features/KanbanBoard'
import Navbar from './components/layout/Navbar'
import { useAuth } from './hooks/useAuth'
import { useMedia } from './hooks/useMedia'
import { MEDIA_TYPES, MEDIA_CONFIG } from './lib/mediaConfig'

const TAB_ICONS = { book: BookOpen, movie: Film, anime: Sparkles }

function extractRecoveryTokens() {
  const hash = window.location.hash.substring(1)
  const hashParams = new URLSearchParams(hash)
  if (hashParams.get('type') === 'recovery' && hashParams.get('access_token')) {
    return {
      accessToken: hashParams.get('access_token'),
      refreshToken: hashParams.get('refresh_token') || '',
    }
  }

  const searchParams = new URLSearchParams(window.location.search)
  if (searchParams.get('type') === 'recovery' && searchParams.get('access_token')) {
    return {
      accessToken: searchParams.get('access_token'),
      refreshToken: searchParams.get('refresh_token') || '',
    }
  }

  return null
}

function useRecoveryTokens() {
  const [cleared, setCleared] = useState(false)
  const tokens = useMemo(() => {
    if (cleared) return null
    const found = extractRecoveryTokens()
    if (found) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    return found
  }, [cleared])
  return [tokens, () => setCleared(true)]
}

function App() {
  const { session, loading: authLoading } = useAuth()
  const [activeType, setActiveType] = useState('book')
  const { items, loading: dataLoading, error, addMedia, updateMedia, deleteMedia } = useMedia(session, activeType)
  const [selectedItem, setSelectedItem] = useState(null)

  const [recoveryTokens, clearRecoveryTokens] = useRecoveryTokens()

  if (recoveryTokens) {
    return (
      <ResetPasswordPage
        accessToken={recoveryTokens.accessToken}
        refreshToken={recoveryTokens.refreshToken}
        onComplete={clearRecoveryTokens}
      />
    )
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading session</span>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-background font-mono text-foreground">
        <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        <Navbar />
        <main className="z-10 flex flex-1 items-center justify-center p-4 sm:p-6">
          <div className="grid w-full max-w-6xl gap-6 sm:gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[2rem] border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl sm:p-10">
              <p className="mb-3 text-xs uppercase tracking-[0.4em] text-primary">
                personal media vault
              </p>
              <h1 className="max-w-3xl text-3xl font-black uppercase tracking-tight text-white sm:text-4xl md:text-6xl">
                One archive for everything you actually care about.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:mt-6 md:text-base">
                Nexus Archive replaces scattered lists with one identity-driven
                dashboard. Track books, movies, and anime — what you finished,
                what you are consuming now, and the notes that make your taste personal.
              </p>
              <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4">
                {['Books', 'Movies', 'Anime'].map((label) => (
                  <div
                    key={label}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm uppercase tracking-wider text-white sm:py-5"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </section>

            <AuthPanel />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background font-mono text-foreground">
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_right,#4f4f4f10_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f10_1px,transparent_1px)] bg-[size:30px_30px] opacity-50"></div>

      <Navbar />

      {/* Media type tabs — sticky below nav */}
      <div className="sticky top-16 z-20 border-b border-white/5 bg-black/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {MEDIA_TYPES.map((type) => {
            const Icon = TAB_ICONS[type]
            const isActive = activeType === type
            return (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-all sm:px-4 sm:text-xs ${
                  isActive
                    ? 'bg-primary/20 text-primary shadow-[0_0_10px_var(--color-primary)]'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={14} />
                {MEDIA_CONFIG[type].label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scrollable main content */}
      <main className="relative z-10 flex-1 overflow-y-auto custom-scrollbar">
        {dataLoading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading library</span>
          </div>
        ) : error ? (
          <div
            role="alert"
            className="border-b border-destructive bg-destructive/10 p-6 text-center font-bold uppercase tracking-widest text-destructive sm:p-10"
          >
            Critical API Error: {error}
          </div>
        ) : (
          <div className="mx-auto max-w-7xl p-4 sm:p-6">
            <LayoutGroup>
              <KanbanBoard
                items={items}
                mediaType={activeType}
                onUpdate={updateMedia}
                onDelete={deleteMedia}
                onSelect={setSelectedItem}
              />
            </LayoutGroup>
          </div>
        )}
      </main>

      {/* Detail modal */}
      <MediaDetailModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onUpdate={updateMedia}
        onDelete={deleteMedia}
      />

      <AddMediaDialog mediaType={activeType} onAdd={addMedia} />
      <LazyAICmdPalette />
    </div>
  )
}

export default App
