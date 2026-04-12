import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2, MessageCircle } from 'lucide-react'
import AddMediaDialog from './components/features/AddMediaDialog'
import AuthPanel from './components/features/AuthPanel'
import LazyAICmdPalette from './components/features/LazyAICmdPalette'
import MediaVault from './components/features/MediaVault'
import ResetPasswordPage from './components/features/ResetPasswordPage'
import KanbanBoard from './components/features/KanbanBoard'
import Navbar from './components/layout/Navbar'
import { useAuth } from './hooks/useAuth'
import { useMedia } from './hooks/useMedia'
import { useRecoveryTokens } from './hooks/useRecoveryTokens'
import { MEDIA_TYPES, MEDIA_CONFIG, TYPE_ICONS } from './lib/mediaConfig'
import { EMAIL_TAB_ICON } from './lib/emailConfig'

const ChatLayout = lazy(() => import('./components/features/ChatLayout'))
const EmailInbox = lazy(() => import('./components/features/EmailInbox'))
const MediaDetailModal = lazy(() => import('./components/features/MediaDetailModal'))
const EditMediaDialog = lazy(() => import('./components/features/EditMediaDialog'))

function App() {
  const { session, loading: authLoading } = useAuth()
  const [activeType, setActiveType] = useState('book')
  const [activeView, setActiveView] = useState('media') // 'media' | 'chat'
  const { items, loading: dataLoading, error, addMedia, updateMedia, deleteMedia } = useMedia(session, activeType)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [vaultState, setVaultState] = useState(null) // { status, type }

  const selectedItem = useMemo(
    () => (selectedItemId ? items.find(i => i.id === selectedItemId) ?? null : null),
    [selectedItemId, items],
  )

  const [recoveryTokens, dismissTokens] = useRecoveryTokens()

  const openVault = useCallback((status, type) => {
    setVaultState({ status, type })
  }, [])

  const handleEdit = useCallback((item) => {
    setEditItem(item)
  }, [])

  const handleSelect = useCallback((item) => {
    setSelectedItemId(item.id)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedItemId(null)
  }, [])

  const handleCloseEdit = useCallback(() => {
    setEditItem(null)
  }, [])

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
        <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />

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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground">
        Skip to main content
      </a>
      <div className="ambient-orbs" />
      <div className="scanlines" />
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[linear-gradient(to_right,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--neon-yellow)/0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <Navbar />

      {/* Navigation tabs — desktop: sticky top, mobile: fixed bottom */}
      <nav className="hidden sm:block sticky top-16 z-40 isolate border-b border-white/[0.04] bg-background/80 backdrop-blur-xl">
        <div role="tablist" aria-label="Media types" className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 xl:px-8">
          {MEDIA_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type]
            const isActive = activeView === 'media' && activeType === type
            return (
              <button
                key={type}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => { setActiveType(type); setActiveView('media'); setVaultState(null) }}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 heading-ui text-[11px] font-semibold uppercase tracking-wider transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-4 sm:text-xs ${
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

          <div className="mx-2 h-4 w-px bg-white/10" />

          <button
            role="tab"
            aria-selected={activeView === 'email'}
            type="button"
            onClick={() => { setActiveView('email'); setVaultState(null) }}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 heading-ui text-[11px] font-semibold uppercase tracking-wider transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-4 sm:text-xs ${
              activeView === 'email'
                ? 'bg-primary/20 text-primary shadow-[0_0_10px_hsl(var(--neon-yellow)/0.4)]'
                : 'text-muted-foreground hover:bg-white/5 hover:text-white'
            }`}
          >
            <EMAIL_TAB_ICON size={14} />
            Email
          </button>

          <button
            role="tab"
            aria-selected={activeView === 'chat'}
            type="button"
            onClick={() => setActiveView('chat')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 heading-ui text-[11px] font-semibold uppercase tracking-wider transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:px-4 sm:text-xs ${
              activeView === 'chat'
                ? 'bg-primary/20 text-primary shadow-[0_0_10px_var(--color-primary)]'
                : 'text-muted-foreground hover:bg-white/5 hover:text-white'
            }`}
          >
            <MessageCircle size={14} />
            AI Chat
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/[0.06] glass-panel pb-[env(safe-area-inset-bottom,0px)]">
        <div role="tablist" aria-label="Media types" className="flex items-center justify-around px-2 py-1.5">
          {MEDIA_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type]
            const isActive = activeView === 'media' && activeType === type
            return (
              <button
                key={type}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => { setActiveType(type); setActiveView('media'); setVaultState(null) }}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all ${
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Icon size={18} />
                <span className="heading-ui text-[9px] font-semibold uppercase tracking-wider">{MEDIA_CONFIG[type].label}</span>
              </button>
            )
          })}
          <button
            role="tab"
            aria-selected={activeView === 'email'}
            type="button"
            onClick={() => { setActiveView('email'); setVaultState(null) }}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all ${
              activeView === 'email'
                ? 'text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <EMAIL_TAB_ICON size={18} />
            <span className="heading-ui text-[9px] font-semibold uppercase tracking-wider">Email</span>
          </button>
          <button
            role="tab"
            aria-selected={activeView === 'chat'}
            type="button"
            onClick={() => setActiveView('chat')}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all ${
              activeView === 'chat'
                ? 'text-primary'
                : 'text-muted-foreground'
            }`}
          >
            <MessageCircle size={18} />
            <span className="heading-ui text-[9px] font-semibold uppercase tracking-wider">Chat</span>
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main id="main-content" className="relative z-10 flex-1 overflow-y-auto custom-scrollbar pb-20 sm:pb-0">
        {activeView === 'email' ? (
          <Suspense fallback={<div className="flex items-center justify-center h-64 text-zinc-500">Loading email...</div>}>
            <div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 xl:p-8">
              <EmailInbox />
            </div>
          </Suspense>
        ) : activeView === 'chat' ? (
          <Suspense fallback={
            <div className="flex h-64 items-center justify-center" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
              <span className="sr-only">Loading chat</span>
            </div>
          }>
            <ChatLayout />
          </Suspense>
        ) : dataLoading && items.length === 0 ? (
          <div className="flex h-64 items-center justify-center" role="status">
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
          <AnimatePresence mode="wait">
            {vaultState ? (
              <Motion.div
                key="vault"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
              >
                <MediaVault
                  key={`${activeType}-${vaultState.status}`}
                  items={items}
                  mediaType={activeType}
                  filterStatus={vaultState.status}
                  onBack={() => setVaultState(null)}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                />
              </Motion.div>
            ) : (
              <Motion.div
                key="overview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 xl:p-8"
              >
                <KanbanBoard
                  items={items}
                  mediaType={activeType}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onHeaderClick={openVault}
                  onAiSuggest={() => setActiveView('chat')}
                />
              </Motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Detail modal */}
      <Suspense fallback={null}>
        <MediaDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          onUpdate={updateMedia}
          onDelete={deleteMedia}
          onEdit={handleEdit}
        />
      </Suspense>

      <Suspense fallback={null}>
        <EditMediaDialog
          item={editItem}
          onUpdate={updateMedia}
          onClose={handleCloseEdit}
        />
      </Suspense>

      <AddMediaDialog mediaType={activeType} onAdd={addMedia} />
      <LazyAICmdPalette mediaType={activeType} onAdd={addMedia} />
    </div>
  )
}

export default App
