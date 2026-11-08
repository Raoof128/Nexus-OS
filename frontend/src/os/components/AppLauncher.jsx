import { memo, useContext, useEffect, useId, useRef, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Lock, LogOut } from 'lucide-react'
import { useWindowStore } from '../stores/windowStore'
import { useFileSystemStore } from '../stores/fileSystemStore'
import { APP_REGISTRY, APP_ORDER } from '../stores/appRegistry'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { AuthContext } from '../../context/auth-context'
import AppIcon from './AppIcon'

// Left column, top block: the default pinned programs, in Win7 order. Nexus has
// no pin editor yet, so this is the fixed default set. Unregistered apps drop out.
const PINNED_APPS = ['chat', 'email', 'files', 'media', 'notes', 'tasks']

// Right column, Win7 order. Only real destinations: Documents and Computer both
// open File Manager, at /documents and at the drive root. Help and Devices have
// no app behind them and are omitted.
const PLACES = [
  { appId: 'files', label: 'Documents', path: '/documents' },
  { appId: 'files', label: 'Computer', path: '/' },
  { divider: true },
  { appId: 'settings', label: 'Control Panel' },
]

// Launches from this menu are remembered locally (per browser) so the left
// column can show recently used programs under the pinned block.
const RECENT_KEY = 'nexus.startmenu.recent'
const RECENT_STORED = 10
const RECENT_SHOWN = 5

const LEFT_ICON = 'flex h-8 w-8 shrink-0 items-center justify-center text-[#3d5a80]'

function readRecent() {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]')
    if (!Array.isArray(list)) return []
    // hasOwn, not a truthy lookup: 'constructor' or 'toString' would otherwise pass
    // as registry entries via Object.prototype.
    return list
      .filter((id) => typeof id === 'string' && Object.hasOwn(APP_REGISTRY, id))
      .slice(0, RECENT_STORED)
  } catch {
    return []
  }
}

function recordLaunch(appId) {
  try {
    const next = [appId, ...readRecent().filter((id) => id !== appId)].slice(0, RECENT_STORED)
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // Storage blocked or full: the launch still happens, it just isn't remembered.
  }
}

function matches(appId, q) {
  const m = APP_REGISTRY[appId]
  if (!m) return false
  const hay = `${m.title} ${m.description ?? ''}`.toLowerCase()
  return hay.includes(q)
}

function alphabetical(ids) {
  return ids
    .filter((id) => APP_REGISTRY[id])
    .sort((a, b) => APP_REGISTRY[a].title.localeCompare(APP_REGISTRY[b].title))
}

// Clicking a row must not pull focus off the search box; keyboard focus stays
// in the box and the highlighted row is announced via aria-activedescendant.
const keepFocus = (e) => e.preventDefault()

function StartOption({ id, index, selected, title, onHover, onActivate, children }) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-idx={index}
      title={title}
      onMouseDown={keepFocus}
      onMouseEnter={onHover}
      onClick={onActivate}
      className={`nx-startmenu__program pointer-coarse:min-h-11 ${selected ? 'is-selected' : ''}`}
    >
      {children}
    </div>
  )
}

/**
 * Windows 7 Start menu. Left: white programs list (pinned, recent, All
 * Programs) above a "Search programs" box. Right: Aero-glass column with the
 * user tile, place shortcuts, and the session actions this browser app can
 * honour, grouped as a Shut down split button (Log off, arrow for Lock).
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

  const baseId = useId()
  const listId = `${baseId}-programs`
  const optionId = (index) => `${baseId}-option-${index}`
  const menuId = `${baseId}-shutdown-menu`

  const [query, setQuery] = useState('')
  const [allPrograms, setAllPrograms] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recent] = useState(readRecent)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef(null)
  const arrowRef = useRef(null)
  const menuRef = useRef(null)
  const powerRef = useRef(null)
  const trapRef = useFocusTrap(true)

  const q = query.trim().toLowerCase()
  const pinned = PINNED_APPS.filter((id) => APP_REGISTRY[id])
  const recentApps = recent.filter((id) => !pinned.includes(id)).slice(0, RECENT_SHOWN)
  const everyApp = alphabetical(APP_ORDER)

  // Rows are the things the keyboard can land on, in on-screen order.
  const appRow = (appId) => ({ kind: 'app', appId })
  const ALL_ROW = { kind: 'all' }
  const BACK_ROW = { kind: 'back' }
  const pinnedRows = pinned.map(appRow)
  const recentRows = recentApps.map(appRow)
  const startRows = [...pinnedRows, ...recentRows, ALL_ROW]
  const allRows = [...everyApp.map(appRow), BACK_ROW]
  const searchRows = q ? everyApp.filter((id) => matches(id, q)).map(appRow) : []
  const rows = q ? searchRows : allPrograms ? allRows : startRows
  const safeIndex = rows.length === 0 ? 0 : Math.min(selectedIndex, rows.length - 1)
  const activeId = rows.length > 0 ? optionId(safeIndex) : undefined

  const canLock = Boolean(onLock)
  const canLogOff = Boolean(auth?.signOut)

  // Typing straight into the Start menu searches, as on Windows 7.
  useEffect(() => {
    if (!isMobile) inputRef.current?.focus()
  }, [isMobile])

  // Escape closes the shut-down menu first, then the whole Start menu.
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (menuOpen) {
        setMenuOpen(false)
        arrowRef.current?.focus()
        return
      }
      toggleLauncher()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [toggleLauncher, menuOpen])

  // Opening the shut-down menu moves focus into it; a pointer press outside
  // the power area dismisses it.
  useEffect(() => {
    if (!menuOpen) return
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    const handlePointerDown = (e) => {
      if (!powerRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [menuOpen])

  const handleLaunch = (appId, path) => {
    recordLaunch(appId)
    // File Manager reads the shared current folder, so set it before opening.
    if (path && useFileSystemStore.getState().files?.[path]) {
      useFileSystemStore.getState().navigateTo(path)
    }
    openApp(appId)
    toggleLauncher()
  }

  const activate = (row) => {
    if (row.kind === 'app') {
      handleLaunch(row.appId)
      return
    }
    // All Programs swaps the list for the full alphabetical one; Back swaps it back.
    setSelectedIndex(0)
    setAllPrograms(row.kind === 'all')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (rows.length === 0) return
    if (e.key === 'Enter') {
      e.preventDefault()
      activate(rows[safeIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((safeIndex + 1) % rows.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((safeIndex - 1 + rows.length) % rows.length)
    }
  }

  const lockNow = () => {
    setMenuOpen(false)
    toggleLauncher()
    onLock?.()
  }

  const logOff = () => {
    setMenuOpen(false)
    toggleLauncher()
    auth?.signOut?.()
  }

  const handleArrowKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setMenuOpen(true)
    }
  }

  const handleMenuKeyDown = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[current < 0 || current === items.length - 1 ? 0 : current + 1].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[current <= 0 ? items.length - 1 : current - 1].focus()
    }
  }

  const renderRow = (row, index) => {
    const selected = index === safeIndex
    const hover = () => setSelectedIndex(index)
    const press = () => activate(row)
    if (row.kind === 'app') {
      const manifest = APP_REGISTRY[row.appId]
      return (
        <StartOption
          key={`app:${row.appId}`}
          id={optionId(index)}
          index={index}
          selected={selected}
          title={manifest.description}
          onHover={hover}
          onActivate={press}
        >
          <AppIcon appId={row.appId} size={32} />
          <span className="truncate">{manifest.title}</span>
        </StartOption>
      )
    }
    if (row.kind === 'back') {
      return (
        <StartOption
          key="back"
          id={optionId(index)}
          index={index}
          selected={selected}
          onHover={hover}
          onActivate={press}
        >
          <span className={LEFT_ICON}>
            <ChevronLeft size={16} aria-hidden="true" />
          </span>
          <span className="truncate">Back</span>
        </StartOption>
      )
    }
    return (
      <StartOption
        key="all"
        id={optionId(index)}
        index={index}
        selected={selected}
        onHover={hover}
        onActivate={press}
      >
        <span className={LEFT_ICON} aria-hidden="true" />
        <span className="truncate">All Programs</span>
        <ChevronRight size={14} className="ml-auto shrink-0 text-[#3d5a80]" aria-hidden="true" />
      </StartOption>
    )
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
                Programs ({searchRows.length})
              </p>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={q ? 'Search results' : allPrograms ? 'All programs' : 'Programs'}
              className="flex flex-col gap-px"
            >
              {q && searchRows.map((row, i) => renderRow(row, i))}
              {!q && allPrograms && allRows.map((row, i) => renderRow(row, i))}
              {!q && !allPrograms && (
                <>
                  {pinnedRows.length > 0 && (
                    <div role="group" aria-label="Pinned" className="flex flex-col gap-px">
                      {pinnedRows.map((row, i) => renderRow(row, i))}
                    </div>
                  )}
                  {recentRows.length > 0 && (
                    <>
                      <div aria-hidden="true" className="nx-startmenu__divider" />
                      <div role="group" aria-label="Recent" className="flex flex-col gap-px">
                        {recentRows.map((row, i) => renderRow(row, pinnedRows.length + i))}
                      </div>
                    </>
                  )}
                  <div aria-hidden="true" className="nx-startmenu__divider" />
                  {renderRow(ALL_ROW, startRows.length - 1)}
                </>
              )}
            </div>
            {rows.length === 0 && (
              <p className="px-3 py-4 text-[9pt] text-muted-foreground" role="status">
                No items match your search.
              </p>
            )}
          </div>

          <div className="nx-startmenu__search">
            <div className="searchbox w-full">
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setSelectedIndex(0)
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search programs"
                aria-label="Search programs"
                aria-controls={listId}
                aria-activedescendant={activeId}
                autoComplete="off"
                className="w-full"
              />
              {/* 7.css styles the search button by its exact lowercase label. */}
              <button
                aria-label="search"
                type="button"
                tabIndex={-1}
                onClick={() => inputRef.current?.focus()}
              />
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
                <div key={`divider-${i}`} className="nx-startmenu__divider" role="separator" />
              ) : (
                <button
                  key={place.label}
                  type="button"
                  onClick={() => handleLaunch(place.appId, place.path)}
                  className="nx-startmenu__link pointer-coarse:min-h-11 focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-white focus-visible:outline-offset-[-2px]"
                >
                  {place.label}
                </button>
              ),
            )}
          </nav>

          {(canLock || canLogOff) && (
            <div
              ref={powerRef}
              className="relative mt-auto flex items-center justify-end pb-1 pr-1"
            >
              <button
                type="button"
                onClick={canLogOff ? logOff : lockNow}
                title={canLogOff ? 'Sign out of Nexus OS' : 'Lock this session'}
                className="nx-startmenu__power rounded-r-none border-r-0 pointer-coarse:min-h-11 focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-white focus-visible:outline-offset-[-3px]"
              >
                <LogOut size={12} aria-hidden="true" />
                {canLogOff ? 'Log off' : 'Lock'}
              </button>
              <button
                ref={arrowRef}
                type="button"
                aria-label="Shut down options"
                title="Shut down options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={handleArrowKeyDown}
                className="nx-startmenu__power rounded-l-none px-[6px] pointer-coarse:min-h-11 focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-white focus-visible:outline-offset-[-3px]"
              >
                <ChevronRight size={12} aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  id={menuId}
                  ref={menuRef}
                  role="menu"
                  aria-label="Shut down options"
                  onKeyDown={handleMenuKeyDown}
                  className="nx-flyout absolute bottom-full right-1 z-10 mb-1 flex min-w-[132px] flex-col p-[2px]"
                >
                  {canLock && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={lockNow}
                      className="nx-menuitem pointer-coarse:min-h-11"
                    >
                      <span className="nx-menuitem__icon">
                        <Lock size={14} aria-hidden="true" />
                      </span>
                      Lock
                    </button>
                  )}
                  {canLogOff && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={logOff}
                      className="nx-menuitem pointer-coarse:min-h-11"
                    >
                      <span className="nx-menuitem__icon">
                        <LogOut size={14} aria-hidden="true" />
                      </span>
                      Log off
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Motion.div>
    </>
  )
}

export default memo(AppLauncher)
