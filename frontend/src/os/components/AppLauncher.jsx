import { memo, useContext, useEffect, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { Lock, LogOut } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { AuthContext } from '../../context/auth-context'
import AppIcon from './AppIcon'

// Right-column shortcuts, Win7 style ("Documents", "Control Panel", …). Each
// opens a real Nexus app; entries for apps that aren't registered are dropped.
const PLACES = [
  { appId: 'files', label: 'Documents' },
  { appId: 'notes', label: 'Notes' },
  { appId: 'tasks', label: 'Tasks' },
  { appId: 'email', label: 'Mail' },
  { divider: true },
  { appId: 'settings', label: 'Control Panel' },
  { appId: 'sysmon', label: 'System Monitor' },
]

function matches(appId, q) {
  const m = APP_REGISTRY[appId]
  if (!m) return false
  const hay = `${m.title} ${m.description ?? ''}`.toLowerCase()
  return hay.includes(q)
}

/**
 * Windows 7 Start menu. Left: white programs list + "Search programs and
 * files" box. Right: Aero-glass column with the user tile, place shortcuts and
 * the session buttons this browser app can actually honour (Lock, Log off).
 */
function AppLauncher({ onLock }) {
  const openApp = useWindowStore((s) => s.openApp)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)
  const isMobile = useWindowStore((s) => s.isMobile)
  const auth = useContext(AuthContext)
  const user = auth?.session?.user
  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'User'

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const trapRef = useFocusTrap(true)

  const q = query.trim().toLowerCase()
  const filtered = q ? APP_ORDER.filter((id) => matches(id, q)) : APP_ORDER

  const [prevLength, setPrevLength] = useState(filtered.length)
  if (filtered.length !== prevLength) {
    setPrevLength(filtered.length)
    setSelectedIndex(0)
  }

  // Typing straight into the Start menu searches, as on Windows 7.
  useEffect(() => {
    if (!isMobile) inputRef.current?.focus()
  }, [isMobile])

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
    if (filtered.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    }
  }

  const places = PLACES.filter((p) => p.divider || APP_REGISTRY[p.appId])

  return (
    <>
      <div
        data-testid="launcher-backdrop"
        className="fixed inset-0 z-[599]"
        onClick={toggleLauncher}
        aria-hidden="true"
      />

      <Motion.div
        ref={trapRef}
        data-testid="app-launcher"
        role="dialog"
        aria-label="Start menu"
        aria-modal="true"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8, transition: { duration: 0.1 } }}
        transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
        className="nx-startmenu z-[600]"
        style={isMobile ? { width: '100vw', borderRadius: 0 } : undefined}
      >
        {/* ── Left: programs + search ───────────────────────────── */}
        <div className="nx-startmenu__left">
          <div className="min-h-0 flex-1 overflow-y-auto p-[5px]">
            {q && (
              <p className="px-2 pb-1 pt-1 text-[9pt] text-w7-title" aria-live="polite">
                Programs ({filtered.length})
              </p>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-[9pt] text-muted-foreground" role="status">
                No items match your search.
              </p>
            ) : (
              <ul
                role="listbox"
                aria-label="Programs"
                className="flex flex-col gap-px border-0 bg-transparent p-0 shadow-none"
              >
                {filtered.map((appId, index) => {
                  const manifest = APP_REGISTRY[appId]
                  if (!manifest) return null
                  const isSelected = index === selectedIndex
                  return (
                    <li key={appId} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleLaunch(appId)}
                        onMouseEnter={() => setSelectedIndex(index)}
                        title={manifest.description}
                        className={`nx-startmenu__program ${isSelected ? 'is-selected' : ''}`}
                      >
                        <AppIcon appId={appId} size={32} />
                        <span className="truncate">{manifest.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="nx-startmenu__search">
            <div className="searchbox w-full">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search programs"
                aria-label="Search programs"
                className="w-full"
              />
              <button aria-label="search" type="button" onClick={() => inputRef.current?.focus()} />
            </div>
          </div>
        </div>

        {/* ── Right: Aero glass column ──────────────────────────── */}
        <div className="nx-startmenu__right">
          <div className="flex justify-center pb-2 pt-1">
            <div className="nx-user-tile" aria-hidden="true">
              <div className="flex h-full w-full items-center justify-center rounded-[3px] bg-gradient-to-b from-[#7ab8ee] to-[#2a6db5] text-[26px] font-light text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
          <p
            className="truncate px-[10px] pb-1 text-[9pt] font-semibold text-white"
            style={{ textShadow: '0 0 8px #000, 0 1px 1px #000a' }}
            title={user?.email}
          >
            {displayName}
          </p>
          <nav aria-label="Places" className="flex flex-col">
            {places.map((place, i) =>
              place.divider ? (
                <div key={`d${i}`} className="nx-startmenu__divider" role="separator" />
              ) : (
                <button
                  key={place.appId}
                  type="button"
                  onClick={() => handleLaunch(place.appId)}
                  className="nx-startmenu__link"
                >
                  {place.label}
                </button>
              ),
            )}
          </nav>

          <div className="mt-auto flex flex-wrap items-center justify-end gap-1 pb-1 pr-1">
            {onLock && (
              <button
                type="button"
                className="nx-startmenu__power"
                onClick={() => {
                  toggleLauncher()
                  onLock()
                }}
                title="Lock this session"
              >
                <Lock size={12} aria-hidden="true" />
                Lock
              </button>
            )}
            {auth?.signOut && (
              <button
                type="button"
                className="nx-startmenu__power"
                onClick={() => {
                  toggleLauncher()
                  auth.signOut()
                }}
                title="Sign out of Nexus OS"
              >
                <LogOut size={12} aria-hidden="true" />
                Log off
              </button>
            )}
          </div>
        </div>
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
