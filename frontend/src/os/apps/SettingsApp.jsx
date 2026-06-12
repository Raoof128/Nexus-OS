import { useState, useEffect, useCallback } from 'react'
import { Bell, Check, HardDrive, Info, LogOut, Palette, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSettingsStore, ACCENT_PRESETS, WALLPAPER_PRESETS } from '../stores/settingsStore'
import { useNotificationStore } from '../stores/notificationStore'
import {
  isOpfsSupported,
  estimateStorage,
  requestPersistentStorage,
  formatBytes,
} from '../../lib/opfsDrive'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'account', label: 'Account', icon: User },
  { id: 'about', label: 'About', icon: Info },
]

const UI_SCALES = [
  { id: 'compact', label: 'Compact' },
  { id: 'default', label: 'Default' },
  { id: 'large', label: 'Large' },
]

function AppearanceTab() {
  const accentColor = useSettingsStore((s) => s.accentColor)
  const uiScale = useSettingsStore((s) => s.uiScale)
  const scanlinesEnabled = useSettingsStore((s) => s.scanlinesEnabled)
  const orbsEnabled = useSettingsStore((s) => s.orbsEnabled)
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const setAccentColor = useSettingsStore((s) => s.setAccentColor)
  const setWallpaper = useSettingsStore((s) => s.setWallpaper)
  const setUiScale = useSettingsStore((s) => s.setUiScale)
  const toggleScanlines = useSettingsStore((s) => s.toggleScanlines)
  const toggleOrbs = useSettingsStore((s) => s.toggleOrbs)

  // Brief "Saved" flash when a new wallpaper is chosen
  const [savedKey, setSavedKey] = useState(null)
  const handleSetWallpaper = (key) => {
    setWallpaper(key)
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 1500)
  }

  return (
    <div className="space-y-6">
      {/* Accent Color */}
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-ui mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Accent Color
        </h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAccentColor(key)}
              aria-pressed={accentColor === key}
              className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all ${
                accentColor === key
                  ? 'bg-white/[0.06] ring-1 ring-white/20'
                  : 'hover:bg-white/[0.03]'
              }`}
            >
              <div
                className={`h-8 w-8 rounded-full transition-shadow ${
                  accentColor === key ? 'shadow-[0_0_12px_currentColor] ring-2 ring-white/30' : ''
                }`}
                style={{ backgroundColor: `hsl(${preset.primary})` }}
              />
              <span className="font-mono text-[9px] text-muted-foreground">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Wallpaper */}
      <div className="glass-panel rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="heading-ui text-xs font-semibold uppercase tracking-wider text-white/60">
            Wallpaper
          </h3>
          {/* "Saved" confirmation badge — appears briefly after selection */}
          <span
            className={`flex items-center gap-1 font-mono text-[9px] text-green-400 transition-opacity duration-300 ${
              savedKey ? 'opacity-100' : 'opacity-0'
            }`}
            aria-live="polite"
          >
            <Check size={9} />
            Saved
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(WALLPAPER_PRESETS).map(([key, preset]) => {
            const isActive = wallpaper === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSetWallpaper(key)}
                aria-pressed={isActive}
                aria-label={`${preset.label}${isActive ? ' (active)' : ''}`}
                className={`group relative flex flex-col items-center gap-2 overflow-hidden rounded-lg border p-2 transition-all ${
                  isActive
                    ? 'border-primary/50 bg-primary/10 shadow-[0_0_12px_hsl(var(--neon-yellow)/0.1)]'
                    : 'border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                }`}
              >
                {/* Thumbnail — uses the same CSS class as the real wallpaper */}
                <div
                  className={`h-12 w-full overflow-hidden rounded-md border border-white/5 transition-transform group-hover:scale-105 ${
                    preset.image ? '' : `wallpaper-${key}`
                  }`}
                  style={
                    preset.image
                      ? {
                          backgroundImage: `url(${preset.image})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }
                      : {}
                  }
                />

                <span
                  className={`truncate w-full text-center font-mono text-[9px] ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {preset.label}
                </span>

                {/* Active checkmark badge */}
                {isActive && (
                  <div className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary shadow-[0_0_8px_hsl(var(--neon-yellow)/0.6)]">
                    <Check size={8} className="text-black" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* UI Scale */}
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-ui mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          UI Scale
        </h3>
        <div className="flex gap-2">
          {UI_SCALES.map((scale) => (
            <button
              key={scale.id}
              type="button"
              onClick={() => setUiScale(scale.id)}
              aria-pressed={uiScale === scale.id}
              className={`rounded-lg px-3 py-1.5 font-mono text-[10px] transition-all ${
                uiScale === scale.id
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                  : 'text-muted-foreground hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              {scale.label}
            </button>
          ))}
        </div>
      </div>

      {/* Wallpaper Effects */}
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-ui mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Wallpaper Effects
        </h3>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">Scanlines overlay</span>
            <button
              type="button"
              role="switch"
              aria-checked={scanlinesEnabled}
              aria-label="Toggle scanlines"
              onClick={toggleScanlines}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                scanlinesEnabled ? 'bg-primary/40' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  scanlinesEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
          <label className="flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">Ambient orbs</span>
            <button
              type="button"
              role="switch"
              aria-checked={orbsEnabled}
              aria-label="Toggle ambient orbs"
              onClick={toggleOrbs}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                orbsEnabled ? 'bg-primary/40' : 'bg-white/10'
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  orbsEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </div>
  )
}

function AccountTab() {
  const { session, signOut } = useAuth()
  const user = session?.user
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleReset = () => {
    localStorage.clear()
    window.location.reload()
  }

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-ui mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Session
        </h3>
        <div className="space-y-2 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span className="text-white">{user?.email || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Provider</span>
            <span className="text-white">{user?.app_metadata?.provider || 'email'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">User ID</span>
            <span className="max-w-[180px] truncate text-white/60">{user?.id || '—'}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20"
        >
          <LogOut size={14} />
          Disconnect Session
        </button>

        <button
          type="button"
          onClick={() => setShowResetConfirm(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-white/40 ring-1 ring-white/10 transition-all hover:bg-white/[0.05] hover:text-white/60"
        >
          System Reset (Factory)
        </button>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="Factory Reset"
        message="This will wipe all local data and preferences. This action cannot be undone."
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
        variant="destructive"
      />
    </div>
  )
}

function StorageTab() {
  const [est, setEst] = useState(null)
  const [persistResult, setPersistResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const supported = isOpfsSupported()

  // Fire-and-forget refresh — setEst runs in the promise callback (not
  // synchronously in the effect body), which keeps react-hooks/set-state-in-effect
  // happy and mirrors the StorageMeter pattern in FileManagerApp.
  const refresh = useCallback(() => {
    estimateStorage().then((e) => setEst(e))
  }, [])

  useEffect(() => {
    let active = true
    estimateStorage().then((e) => {
      if (active) setEst(e)
    })
    return () => {
      active = false
    }
  }, [])

  const handlePersist = async () => {
    setBusy(true)
    const ok = await requestPersistentStorage()
    setPersistResult(ok)
    setBusy(false)
  }

  const usage = est?.usage ?? 0
  const quota = est?.quota ?? 0
  const pct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wider text-white/50">
          Nexus Drive Storage
        </h3>
        {!supported && (
          <p className="text-sm text-amber-400/80">
            Persistent file storage (OPFS) isn't available in this browser — imported files won't
            survive a reload.
          </p>
        )}
        {est ? (
          <>
            <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-white/60">
              {formatBytes(usage)} used of {formatBytes(quota)} available
              <span className="ml-1 text-white/40">({pct.toFixed(1)}%)</span>
            </p>
          </>
        ) : (
          <p className="text-sm text-white/40">Storage estimate unavailable.</p>
        )}
        <button
          onClick={refresh}
          className="mt-3 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60 transition-colors hover:text-white"
        >
          Refresh
        </button>
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wider text-white/50">
          Persistent Storage
        </h3>
        <p className="mb-3 text-sm text-white/60">
          Ask the browser to mark Nexus Drive as persistent so files aren't evicted automatically
          when disk space runs low.
        </p>
        <button
          onClick={handlePersist}
          disabled={busy}
          className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {busy ? 'Requesting…' : 'Request persistent storage'}
        </button>
        {persistResult === true && (
          <p className="mt-2 text-sm text-emerald-400/90">✓ Storage is now persistent.</p>
        )}
        {persistResult === false && (
          <p className="mt-2 text-sm text-amber-400/80">
            The browser declined — storage stays best-effort.
          </p>
        )}
      </section>
    </div>
  )
}

function NotificationsTab() {
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const notifications = useNotificationStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wider text-white/50">
          Do Not Disturb
        </h3>
        <label className="flex items-center justify-between">
          <span className="text-sm text-white/70">
            Suppress toast pop-ups (notifications still log to the centre)
          </span>
          <button
            onClick={toggleDoNotDisturb}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              doNotDisturb ? 'bg-primary' : 'bg-white/20'
            }`}
            role="switch"
            aria-checked={doNotDisturb}
            aria-label="Toggle Do Not Disturb"
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                doNotDisturb ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm uppercase tracking-wider text-white/50">
          History
        </h3>
        <p className="mb-3 text-sm text-white/60">
          {notifications.length} total · {unread} unread
        </p>
        <div className="flex gap-2">
          <button
            onClick={markAllRead}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
          >
            Mark all read
          </button>
          <button
            onClick={clearAll}
            className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            Clear all
          </button>
        </div>
      </section>
    </div>
  )
}

function AboutTab() {
  const shortcuts = [
    { keys: 'Alt + W', action: 'Close window' },
    { keys: 'Alt + M', action: 'Minimize window' },
    { keys: 'Alt + \u2191', action: 'Maximize / Restore' },
    { keys: 'Alt + \u2190 / \u2192', action: 'Snap left / right' },
    { keys: 'Alt + [ / ]', action: 'Cycle windows' },
    { keys: 'Alt + 1-8', action: 'Open app' },
    { keys: 'Alt + L', action: 'App launcher' },
    { keys: 'Cmd/Ctrl + K', action: 'Command palette' },
  ]

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-display mb-1 text-sm font-bold text-primary">Nexus OS</h3>
        <p className="font-mono text-[10px] text-muted-foreground">v2.1.0 — Production Grade</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          A cyberpunk browser OS for managing your media vault, email, and AI chat.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-ui mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
          Keyboard Shortcuts
        </h3>
        <div className="space-y-1.5">
          {shortcuts.map((s) => (
            <div key={s.keys} className="flex items-center justify-between font-mono text-[10px]">
              <kbd
                className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-white/70"
                aria-label={s.keys
                  .replace(/\+/g, ' plus ')
                  .replace(/↑/g, 'Up Arrow')
                  .replace(/←/g, 'Left Arrow')
                  .replace(/→/g, 'Right Arrow')
                  .replace(/\s+/g, ' ')
                  .trim()}
              >
                {s.keys}
              </kbd>
              <span className="text-muted-foreground">{s.action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState('appearance')

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Sidebar */}
      <nav className="flex w-[140px] shrink-0 flex-col gap-1 border-r border-white/[0.04] bg-black/20 p-2 @md:w-[180px]">
        <p className="heading-display mb-2 px-2 pt-1 text-[8px] tracking-[0.3em] text-primary/40">
          // Settings
        </p>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 heading-ui text-[10px] font-semibold transition-all ${
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'storage' && <StorageTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
