import { memo, useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { Search, SearchX } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import { SPRING } from '../../lib/motion'
import { useFocusTrap } from '../../hooks/useFocusTrap'

function AppLauncher() {
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const isMobile = useWindowStore((s) => s.isMobile)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const trapRef = useFocusTrap(true)

  // Filter apps by query
  const filtered = query.trim()
    ? APP_ORDER.filter((appId) => {
        const manifest = APP_REGISTRY[appId]
        return manifest?.title.toLowerCase().includes(query.toLowerCase())
      })
    : APP_ORDER

  const [prevLength, setPrevLength] = useState(filtered.length)
  if (filtered.length !== prevLength) {
    setPrevLength(filtered.length)
    setSelectedIndex(0)
  }

  // Auto-focus on desktop only
  useEffect(() => {
    if (!isMobile && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isMobile])

  // Escape closes the launcher — matches ContextMenu / LockScreen dismissal so
  // keyboard users can back out without reaching for the mouse or the backdrop.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        toggleLauncher()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [toggleLauncher])

  const handleLaunch = (appId) => {
    openApp(appId)
    toggleLauncher()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault()
      handleLaunch(filtered[selectedIndex])
      return
    }
    // No results → nothing to navigate; bail before any modulo-by-zero math.
    if (filtered.length === 0) return
    if (e.key === 'ArrowRight') {
      setSelectedIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowLeft') {
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'ArrowDown') {
      const cols = isMobile ? 3 : 4
      if (selectedIndex + cols < filtered.length) {
        setSelectedIndex((prev) => prev + cols)
      }
    } else if (e.key === 'ArrowUp') {
      const cols = isMobile ? 3 : 4
      if (selectedIndex - cols >= 0) {
        setSelectedIndex((prev) => prev - cols)
      }
    }
  }

  return (
    <>
      <div
        data-testid="launcher-backdrop"
        className="fixed inset-0 z-[599] bg-black/50 backdrop-blur-sm"
        onClick={toggleLauncher}
      />

      <Motion.div
        ref={trapRef}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={SPRING.snappy}
        className="neon-border glass-panel fixed bottom-14 left-1/2 z-[600] w-[90vw] max-w-md -translate-x-1/2 rounded-2xl p-4 shadow-[0_0_60px_rgba(0,255,255,0.05)] sm:bottom-16 sm:p-6"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <p className="mb-3 heading-display text-[10px] tracking-[0.3em] text-primary/50">
          // Applications
        </p>

        {/* Search input */}
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 focus-within:border-primary/30 focus-within:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.08)]">
          <Search size={11} className="shrink-0 text-primary/40" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="search::applications..."
            aria-label="Search applications"
            className="flex-1 bg-transparent font-mono text-[11px] text-white/70 placeholder-muted-foreground/30 focus:outline-none"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6">
            <SearchX size={24} className="text-muted-foreground/30" />
            <p className="font-mono text-[10px] text-muted-foreground/50">NO_MATCHES_FOUND</p>
          </div>
        ) : (
          // md: (768px) matches the isMobile breakpoint used by the arrow-key column
          // math above, so keyboard navigation always moves the way the grid looks.
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
            {filtered.map((appId, index) => {
              const manifest = APP_REGISTRY[appId]
              if (!manifest) return null
              const Icon = manifest.icon
              const isSelected = index === selectedIndex
              return (
                <button
                  key={appId}
                  type="button"
                  onClick={() => handleLaunch(appId)}
                  aria-label={manifest.title}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group flex flex-col items-center gap-2 rounded-xl p-3 transition-all hover:bg-white/[0.04] hover:shadow-[0_0_15px_rgba(0,255,255,0.05)] sm:p-4 ${
                    isSelected ? 'ring-1 ring-primary/40 bg-primary/[0.04]' : ''
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] transition-all group-hover:bg-primary/10 group-hover:ring-primary/20 group-hover:shadow-[0_0_10px_hsl(var(--neon-yellow)/0.15)] ${
                      isSelected ? 'bg-primary/10 ring-primary/20' : ''
                    }`}
                  >
                    <Icon
                      size={20}
                      className={`text-muted-foreground transition-colors group-hover:text-primary ${isSelected ? 'text-primary' : ''}`}
                    />
                  </div>
                  <span className="heading-ui text-[11px] font-semibold text-muted-foreground transition-colors group-hover:text-white">
                    {manifest.title}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
