import { useState, useEffect, useCallback } from 'react'
import { Bell, HardDrive, Info, LogOut, Palette, User } from 'lucide-react'
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

// Control Panel categories. `heading` is the Win7 main instruction shown above the content.
const CATEGORIES = [
  {
    id: 'personalization',
    label: 'Personalization',
    heading: 'Change the visuals on your computer',
    icon: Palette,
  },
  {
    id: 'storage',
    label: 'Nexus Drive',
    heading: 'Manage the storage on this computer',
    icon: HardDrive,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    heading: 'Choose how notifications appear',
    icon: Bell,
  },
  { id: 'accounts', label: 'User Accounts', heading: 'Manage your account', icon: User },
  { id: 'system', label: 'System', heading: 'View basic information about Nexus OS', icon: Info },
]

const UI_SCALES = [
  { id: 'compact', label: 'Smaller' },
  { id: 'default', label: 'Medium' },
  { id: 'large', label: 'Larger' },
]

const SHORTCUTS = [
  { keys: 'Alt + W', action: 'Close window' },
  { keys: 'Alt + M', action: 'Minimize window' },
  { keys: 'Alt + ↑', action: 'Maximize / Restore' },
  { keys: 'Alt + ← / →', action: 'Snap left / right' },
  { keys: 'Alt + [ / ]', action: 'Cycle windows' },
  { keys: 'Alt + 1-8', action: 'Open app' },
  { keys: 'Alt + L', action: 'App launcher' },
  { keys: 'Cmd/Ctrl + K', action: 'Command palette' },
]

function PersonalizationPanel() {
  const accentColor = useSettingsStore((s) => s.accentColor)
  const uiScale = useSettingsStore((s) => s.uiScale)
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const setAccentColor = useSettingsStore((s) => s.setAccentColor)
  const setWallpaper = useSettingsStore((s) => s.setWallpaper)
  const setUiScale = useSettingsStore((s) => s.setUiScale)

  // Brief "Saved" flash when a new wallpaper is chosen
  const [savedKey, setSavedKey] = useState(null)
  const handleSetWallpaper = (key) => {
    setWallpaper(key)
    setSavedKey(key)
    setTimeout(() => setSavedKey(null), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Window colour */}
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Window colour</legend>
        <div className="flex flex-wrap gap-3 pt-2">
          {Object.entries(ACCENT_PRESETS).map(([key, preset]) => {
            const isActive = accentColor === key
            return (
              <div key={key} className="flex w-[60px] flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAccentColor(key)}
                  aria-pressed={isActive}
                  title={preset.label}
                  aria-label={preset.label}
                  className={`h-10 w-[52px] rounded-[3px] border border-[#00000040] ${
                    isActive ? 'outline outline-2 outline-offset-1 outline-[#3399ff]' : ''
                  }`}
                  style={{
                    background: `linear-gradient(#ffffff80, #fff0 50%), ${preset.frame}`,
                  }}
                />
                <span className="text-center text-[12px]">{preset.label}</span>
              </div>
            )
          })}
        </div>
      </fieldset>

      {/* Desktop background */}
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Desktop background</legend>
        {/* "Saved" confirmation — appears briefly after selection */}
        <p
          className={`mt-1 text-[12px] text-success transition-opacity duration-300 ${
            savedKey ? 'opacity-100' : 'opacity-0'
          }`}
          aria-live="polite"
        >
          Saved
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,132px))] gap-2 pt-1">
          {Object.entries(WALLPAPER_PRESETS).map(([key, preset]) => {
            const isActive = wallpaper === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSetWallpaper(key)}
                aria-pressed={isActive}
                aria-label={`${preset.label}${isActive ? ' (active)' : ''}`}
                className={`w7-item flex flex-col items-center gap-1 p-1 text-[12px] ${
                  isActive ? 'is-selected' : ''
                }`}
              >
                <img
                  src={preset.image}
                  alt={preset.label}
                  width={120}
                  height={75}
                  loading="lazy"
                  className="h-[75px] w-[120px] max-w-full border border-[#828790] object-cover"
                />
                <span className="w-full truncate text-center">{preset.label}</span>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Display size */}
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Display size</legend>
        <div className="flex flex-col gap-2 pt-2">
          {UI_SCALES.map((scale) => {
            const id = `ui-scale-${scale.id}`
            return (
              <div key={scale.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={id}
                  name="uiScale"
                  value={scale.id}
                  checked={uiScale === scale.id}
                  onChange={() => setUiScale(scale.id)}
                />
                <label htmlFor={id}>{scale.label}</label>
              </div>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

function AccountsPanel() {
  const { session, signOut } = useAuth()
  const user = session?.user
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const handleReset = () => {
    localStorage.clear()
    window.location.reload()
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Session</legend>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 pt-2 text-[12px]">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="min-w-0 truncate">{user?.email || '—'}</dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd>{user?.app_metadata?.provider || 'email'}</dd>
          <dt className="text-muted-foreground">User ID</dt>
          <dd className="min-w-0 truncate text-[12px]">{user?.id || '—'}</dd>
        </dl>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={signOut} className="w7-btn">
          <LogOut size={14} />
          Sign out
        </button>
        <button type="button" onClick={() => setShowResetConfirm(true)} className="w7-btn">
          Factory reset
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

function StoragePanel() {
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
  const pct = quota > 0 ? Math.min(100, Math.round((usage / quota) * 100)) : 0

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Nexus Drive storage</legend>
        <div className="flex flex-col gap-2 pt-2">
          {!supported && (
            <p className="text-warning">
              Persistent file storage (OPFS) isn't available in this browser. Imported files won't
              survive a reload.
            </p>
          )}
          {est ? (
            <>
              <div role="progressbar" aria-label="Storage used" aria-valuenow={pct}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <p>
                {formatBytes(usage)} used of {formatBytes(quota)} available{' '}
                <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">Storage estimate unavailable.</p>
          )}
          <div>
            <button type="button" onClick={refresh} className="w7-btn">
              Refresh
            </button>
          </div>
        </div>
      </fieldset>

      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Persistent storage</legend>
        <div className="flex flex-col gap-2 pt-2">
          <p>
            Ask the browser to mark Nexus Drive as persistent so files aren't evicted automatically
            when disk space runs low.
          </p>
          <div>
            <button type="button" onClick={handlePersist} disabled={busy} className="w7-btn">
              {busy ? 'Requesting…' : 'Request persistent storage'}
            </button>
          </div>
          {persistResult === true && <p className="text-success">Storage is now persistent.</p>}
          {persistResult === false && (
            <p className="text-warning">The browser declined. Storage stays best-effort.</p>
          )}
        </div>
      </fieldset>
    </div>
  )
}

function NotificationsPanel() {
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const toggleDoNotDisturb = useNotificationStore((s) => s.toggleDoNotDisturb)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const notifications = useNotificationStore((s) => s.notifications)
  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Do not disturb</legend>
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="notifications-dnd"
            checked={doNotDisturb}
            onChange={toggleDoNotDisturb}
          />
          <label htmlFor="notifications-dnd">
            Hide toast pop-ups (notifications are still kept in the notification centre)
          </label>
        </div>
      </fieldset>

      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">History</legend>
        <div className="flex flex-col gap-2 pt-2">
          <p>
            {notifications.length} total · {unread} unread
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={markAllRead} className="w7-btn">
              Mark all as read
            </button>
            <button type="button" onClick={clearAll} className="w7-btn">
              Clear all
            </button>
          </div>
        </div>
      </fieldset>
    </div>
  )
}

function SystemPanel() {
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Nexus OS</legend>
        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 pt-2 text-[12px]">
          <dt className="text-muted-foreground">Version</dt>
          <dd>2.1.0</dd>
          <dt className="text-muted-foreground">Edition</dt>
          <dd>Production</dd>
          <dt className="text-muted-foreground">About</dt>
          <dd>A browser desktop for your media vault, email, and AI chat.</dd>
        </dl>
      </fieldset>

      <fieldset className="border border-[#d6dbe3] p-3 pt-1">
        <legend className="px-1">Keyboard shortcuts</legend>
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr>
              <th scope="col" className="text-left font-normal">
                Shortcut
              </th>
              <th scope="col" className="text-left font-normal">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys}>
                <td>
                  <kbd
                    className="rounded-[3px] border border-border bg-w7-surface px-1.5 py-px text-[12px]"
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
                </td>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </div>
  )
}

export default function SettingsApp() {
  const [activeId, setActiveId] = useState('personalization')
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]

  return (
    <div className="flex h-full w-full overflow-hidden bg-white text-[12px] text-foreground">
      {/* Category pane */}
      <nav
        aria-label="Control Panel categories"
        className="w7-navpane flex w-[140px] shrink-0 flex-col gap-px p-1 @md:w-[180px]"
      >
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = activeId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveId(cat.id)}
              aria-current={isActive ? 'page' : undefined}
              className="w7-item flex items-center gap-2 px-2 py-1 text-left"
            >
              <Icon size={16} className="shrink-0 text-[#3d5a80]" />
              <span className="truncate">{cat.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <h2 className="w7-heading mb-4">{active.heading}</h2>
        {activeId === 'personalization' && <PersonalizationPanel />}
        {activeId === 'storage' && <StoragePanel />}
        {activeId === 'notifications' && <NotificationsPanel />}
        {activeId === 'accounts' && <AccountsPanel />}
        {activeId === 'system' && <SystemPanel />}
      </div>
    </div>
  )
}
