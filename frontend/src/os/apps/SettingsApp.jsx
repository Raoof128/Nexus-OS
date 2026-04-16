import { useState } from 'react'
import { Info, LogOut, Palette, User } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useSettingsStore, ACCENT_PRESETS } from '../stores/settingsStore'

const TABS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
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
  const setAccentColor = useSettingsStore((s) => s.setAccentColor)
  const setUiScale = useSettingsStore((s) => s.setUiScale)
  const toggleScanlines = useSettingsStore((s) => s.toggleScanlines)
  const toggleOrbs = useSettingsStore((s) => s.toggleOrbs)

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
              className={`flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all ${
                accentColor === key ? 'bg-white/[0.06] ring-1 ring-white/20' : 'hover:bg-white/[0.03]'
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
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                scanlinesEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
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
              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                orbsEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
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

      <button
        type="button"
        onClick={signOut}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20"
      >
        <LogOut size={14} />
        Disconnect Session
      </button>
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
  ]

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-xl p-4">
        <h3 className="heading-display mb-1 text-sm font-bold text-primary">Nexus OS</h3>
        <p className="font-mono text-[10px] text-muted-foreground">v1.0.0 — Phase 3</p>
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
              <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-white/70">
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
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}
