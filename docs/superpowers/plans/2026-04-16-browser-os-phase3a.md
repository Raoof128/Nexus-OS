# Nexus Browser OS — Phase 3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build 3 new apps for the Nexus browser OS: Settings (theme customization), System Monitor (health dashboard), and Notes (markdown editor). Replace their PlaceholderApp entries in the registry.

**Architecture:** New `frontend/src/os/apps/` directory for windowed applications (separate from `os/components/` which holds shell UI). A new `settingsStore.js` manages theme preferences. Desktop.jsx reads settings to conditionally render wallpaper effects. Each app is lazy-loaded via the existing registry.

**Tech Stack:** React 19, Zustand (existing), Tailwind CSS v4, Lucide React (existing)

---

## File Map

### New files

| File                                                     | Responsibility                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `frontend/src/os/stores/settingsStore.js`                | Theme preferences — accent color, UI scale, scanlines/orbs toggles |
| `frontend/src/os/apps/SettingsApp.jsx`                   | Settings app — appearance, account, about tabs                     |
| `frontend/src/os/apps/SystemMonitorApp.jsx`              | System health dashboard — API, Realtime, session, performance      |
| `frontend/src/os/apps/NotesApp.jsx`                      | Markdown note editor with localStorage persistence                 |
| `frontend/src/os/stores/__tests__/settingsStore.test.js` | Settings store tests                                               |
| `frontend/src/os/apps/__tests__/NotesApp.test.jsx`       | Notes app tests                                                    |

### Modified files

| File                                    | Change                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| `frontend/src/os/stores/appRegistry.js` | Swap PlaceholderApp for real components (settings, sysmon, notes)                |
| `frontend/src/os/Desktop.jsx`           | Pass `windowId` to app components; read settingsStore for scanlines/orbs toggles |

---

## Task 1: Settings Store

**Files:**

- Create: `frontend/src/os/stores/settingsStore.js`
- Create: `frontend/src/os/stores/__tests__/settingsStore.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/stores/__tests__/settingsStore.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '../settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettingsStore.setState({
      accentColor: 'yellow',
      uiScale: 'default',
      scanlinesEnabled: true,
      orbsEnabled: true,
    })
  })

  it('initializes with default values', () => {
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('yellow')
    expect(state.uiScale).toBe('default')
    expect(state.scanlinesEnabled).toBe(true)
    expect(state.orbsEnabled).toBe(true)
  })

  it('setAccentColor updates the accent', () => {
    useSettingsStore.getState().setAccentColor('cyan')
    expect(useSettingsStore.getState().accentColor).toBe('cyan')
  })

  it('setUiScale updates the scale', () => {
    useSettingsStore.getState().setUiScale('large')
    expect(useSettingsStore.getState().uiScale).toBe('large')
  })

  it('toggleScanlines flips the boolean', () => {
    useSettingsStore.getState().toggleScanlines()
    expect(useSettingsStore.getState().scanlinesEnabled).toBe(false)
    useSettingsStore.getState().toggleScanlines()
    expect(useSettingsStore.getState().scanlinesEnabled).toBe(true)
  })

  it('toggleOrbs flips the boolean', () => {
    useSettingsStore.getState().toggleOrbs()
    expect(useSettingsStore.getState().orbsEnabled).toBe(false)
  })

  it('hydrateSettings restores from localStorage', () => {
    localStorage.setItem(
      'nexus-os:settings',
      JSON.stringify({
        accentColor: 'magenta',
        uiScale: 'compact',
        scanlinesEnabled: false,
        orbsEnabled: false,
      }),
    )
    useSettingsStore.getState().hydrateSettings()
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('magenta')
    expect(state.uiScale).toBe('compact')
    expect(state.scanlinesEnabled).toBe(false)
  })

  it('hydrateSettings handles corrupt data gracefully', () => {
    localStorage.setItem('nexus-os:settings', 'broken{{{')
    useSettingsStore.getState().hydrateSettings()
    expect(useSettingsStore.getState().accentColor).toBe('yellow')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/settingsStore.test.js
```

- [ ] **Step 3: Create the settings store**

Create `frontend/src/os/stores/settingsStore.js`:

```js
import { create } from 'zustand'

const STORAGE_KEY = 'nexus-os:settings'

export const ACCENT_PRESETS = {
  yellow: { primary: '56 100% 48%', neon: '56 100% 48%', label: 'Neon Yellow' },
  cyan: { primary: '180 100% 50%', neon: '180 100% 50%', label: 'Cyber Cyan' },
  magenta: { primary: '300 100% 50%', neon: '300 100% 50%', label: 'Hot Magenta' },
  green: { primary: '120 100% 40%', neon: '120 100% 40%', label: 'Matrix Green' },
  orange: { primary: '30 100% 50%', neon: '30 100% 50%', label: 'Blaze Orange' },
}

function saveToStorage(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentColor: state.accentColor,
        uiScale: state.uiScale,
        scanlinesEnabled: state.scanlinesEnabled,
        orbsEnabled: state.orbsEnabled,
      }),
    )
  } catch {
    // Storage unavailable
  }
}

function applyAccentToDOM(colorKey) {
  const preset = ACCENT_PRESETS[colorKey]
  if (!preset) return
  const root = document.documentElement
  root.style.setProperty('--primary', preset.primary)
  root.style.setProperty('--neon-yellow', preset.neon)
  root.style.setProperty('--accent', preset.primary)
  root.style.setProperty('--ring', preset.primary)
}

export const useSettingsStore = create((set, get) => ({
  accentColor: 'yellow',
  uiScale: 'default',
  scanlinesEnabled: true,
  orbsEnabled: true,

  setAccentColor: (color) => {
    set({ accentColor: color })
    applyAccentToDOM(color)
    saveToStorage(get())
  },

  setUiScale: (scale) => {
    set({ uiScale: scale })
    saveToStorage(get())
  },

  toggleScanlines: () => {
    set((s) => ({ scanlinesEnabled: !s.scanlinesEnabled }))
    saveToStorage(get())
  },

  toggleOrbs: () => {
    set((s) => ({ orbsEnabled: !s.orbsEnabled }))
    saveToStorage(get())
  },

  hydrateSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.accentColor) {
        set({
          accentColor: saved.accentColor,
          uiScale: saved.uiScale || 'default',
          scanlinesEnabled: saved.scanlinesEnabled ?? true,
          orbsEnabled: saved.orbsEnabled ?? true,
        })
        applyAccentToDOM(saved.accentColor)
      }
    } catch {
      // Corrupt data
    }
  },
}))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/stores/__tests__/settingsStore.test.js
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/settingsStore.js frontend/src/os/stores/__tests__/settingsStore.test.js
git commit -m "feat: add settings store with accent colors, UI scale, and wallpaper toggles"
```

---

## Task 2: Settings App

**Files:**

- Create: `frontend/src/os/apps/SettingsApp.jsx`

- [ ] **Step 1: Create the Settings app**

Create `frontend/src/os/apps/SettingsApp.jsx`:

```jsx
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
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/apps/SettingsApp.jsx
git commit -m "feat: add Settings app with theme colors, UI scale, and wallpaper toggles"
```

---

## Task 3: System Monitor App

**Files:**

- Create: `frontend/src/os/apps/SystemMonitorApp.jsx`

- [ ] **Step 1: Create the System Monitor app**

Create `frontend/src/os/apps/SystemMonitorApp.jsx`:

```jsx
import { useCallback, useEffect, useState } from 'react'
import { Activity, Globe, MonitorCog, Wifi } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useWindowStore } from '../stores/windowStore'

const API_URL = import.meta.env.VITE_API_URL

function StatusDot({ status }) {
  const colors = {
    online: 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]',
    offline: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]',
    checking: 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)] animate-pulse',
  }
  return <div className={`h-2 w-2 rounded-full ${colors[status] || colors.checking}`} />
}

function Panel({ icon: Icon, title, children }) {
  return (
    <div className="glass-panel rounded-xl p-3 @sm:p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
      <div className="mb-3 flex items-center gap-2">
        <Icon size={12} className="text-primary" />
        <h3 className="heading-ui text-[10px] font-semibold uppercase tracking-wider text-white/60">
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, value, mono = true }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] text-white/80 ${mono ? 'font-mono' : 'heading-ui'}`}>
        {value}
      </span>
    </div>
  )
}

export default function SystemMonitorApp() {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)

  // API healthcheck
  const [apiStatus, setApiStatus] = useState('checking')
  const [apiLatency, setApiLatency] = useState(null)
  const [lastCheck, setLastCheck] = useState(null)

  const checkHealth = useCallback(async () => {
    setApiStatus('checking')
    const start = performance.now()
    try {
      const res = await fetch(`${API_URL}/healthz`, { signal: AbortSignal.timeout(5000) })
      const latency = Math.round(performance.now() - start)
      setApiLatency(latency)
      setApiStatus(res.ok ? 'online' : 'offline')
      setLastCheck(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
    } catch {
      setApiLatency(null)
      setApiStatus('offline')
      setLastCheck(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }),
      )
    }
  }, [])

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30_000)
    return () => clearInterval(interval)
  }, [checkHealth])

  // Performance metrics (Chrome only)
  const perfMemory = performance.memory
  const heapUsed = perfMemory ? `${Math.round(perfMemory.usedJSHeapSize / 1048576)}MB` : '—'
  const heapLimit = perfMemory ? `${Math.round(perfMemory.jsHeapSizeLimit / 1048576)}MB` : '—'

  const connection = navigator.connection
  const networkType = connection?.effectiveType || '—'
  const downlink = connection?.downlink ? `${connection.downlink} Mbps` : '—'

  // Window stats
  const windowCount = Object.keys(windows).length
  const visibleCount = zStack.filter((id) => windows[id]?.state !== 'minimized').length
  const appCounts = Object.values(windows).reduce((acc, w) => {
    acc[w.appId] = (acc[w.appId] || 0) + 1
    return acc
  }, {})

  const user = session?.user

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar p-3 @sm:p-4">
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @sm:gap-4">
        {/* API Health */}
        <Panel icon={Globe} title="API Health">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status={apiStatus} />
              <span className="heading-display text-sm font-bold text-white">
                {apiStatus === 'online'
                  ? 'ONLINE'
                  : apiStatus === 'offline'
                    ? 'OFFLINE'
                    : 'CHECKING'}
              </span>
            </div>
            <DataRow label="Latency" value={apiLatency != null ? `${apiLatency}ms` : '—'} />
            <DataRow label="Endpoint" value="/healthz" />
            <DataRow label="Last check" value={lastCheck || '—'} />
          </div>
        </Panel>

        {/* Realtime */}
        <Panel icon={Wifi} title="Realtime">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot status="online" />
              <span className="heading-display text-sm font-bold text-white">CONNECTED</span>
            </div>
            <DataRow label="Protocol" value="WebSocket" />
            <DataRow label="Provider" value="Supabase" />
          </div>
        </Panel>

        {/* Session */}
        <Panel icon={MonitorCog} title="Session">
          <div className="space-y-1">
            <DataRow label="User" value={user?.email || '—'} />
            <DataRow label="Provider" value={user?.app_metadata?.provider || 'email'} />
            <DataRow label="Windows" value={`${visibleCount} visible / ${windowCount} total`} />
            {Object.entries(appCounts).map(([appId, count]) => (
              <DataRow key={appId} label={`  ${appId}`} value={`×${count}`} />
            ))}
          </div>
        </Panel>

        {/* Performance */}
        <Panel icon={Activity} title="Performance">
          <div className="space-y-1">
            <DataRow label="JS Heap" value={heapUsed} />
            <DataRow label="Heap Limit" value={heapLimit} />
            <DataRow label="Network" value={networkType} />
            <DataRow label="Downlink" value={downlink} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/apps/SystemMonitorApp.jsx
git commit -m "feat: add System Monitor app with API health, session, and performance panels"
```

---

## Task 4: Notes App

**Files:**

- Create: `frontend/src/os/apps/NotesApp.jsx`
- Create: `frontend/src/os/apps/__tests__/NotesApp.test.jsx`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/os/apps/__tests__/NotesApp.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import NotesApp from '../NotesApp'

describe('NotesApp', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders a textarea for editing', () => {
    render(<NotesApp windowId="notes-abc" />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('saves content to localStorage on change', async () => {
    vi.useFakeTimers()
    render(<NotesApp windowId="notes-abc" />)
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Hello world' } })
    vi.advanceTimersByTime(600)
    expect(localStorage.getItem('nexus-os:note-notes-abc')).toContain('Hello world')
    vi.useRealTimers()
  })

  it('restores content from localStorage on mount', () => {
    localStorage.setItem('nexus-os:note-notes-abc', JSON.stringify({ content: 'Saved note' }))
    render(<NotesApp windowId="notes-abc" />)
    expect(screen.getByRole('textbox').value).toBe('Saved note')
  })

  it('toggles between edit and preview mode', () => {
    render(<NotesApp windowId="notes-abc" />)
    const previewBtn = screen.getByText('Preview')
    fireEvent.click(previewBtn)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByText('Edit')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/apps/__tests__/NotesApp.test.jsx
```

- [ ] **Step 3: Create the Notes app**

Create `frontend/src/os/apps/NotesApp.jsx`:

````jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Eye, Pencil } from 'lucide-react'

const SAVE_DEBOUNCE_MS = 500

function renderMarkdown(text) {
  if (!text) return ''
  return (
    text
      // Code blocks (must come before inline code)
      .replace(
        /```([\s\S]*?)```/g,
        '<pre class="my-2 rounded-lg bg-white/[0.03] p-3 font-mono text-[11px] text-white/70 overflow-x-auto border border-white/[0.06]"><code>$1</code></pre>',
      )
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-primary/80">$1</code>',
      )
      // Headers
      .replace(
        /^### (.+)$/gm,
        '<h3 class="heading-ui mt-3 mb-1 text-sm font-semibold text-white">$1</h3>',
      )
      .replace(
        /^## (.+)$/gm,
        '<h2 class="heading-display mt-4 mb-1 text-base font-bold text-primary">$1</h2>',
      )
      .replace(
        /^# (.+)$/gm,
        '<h1 class="heading-display mt-4 mb-2 text-lg font-bold text-primary">$1</h1>',
      )
      // Bold + Italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em class="text-white/80">$1</em>')
      // Unordered lists
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-muted-foreground">$1</li>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr class="my-3 border-white/[0.06]" />')
      // Line breaks
      .replace(/\n/g, '<br />')
  )
}

export default function NotesApp({ windowId }) {
  const storageKey = `nexus-os:note-${windowId}`
  const [content, setContent] = useState('')
  const [preview, setPreview] = useState(false)
  const saveTimeout = useRef(null)

  // Load on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.content) setContent(saved.content)
      }
    } catch {
      // Corrupt data
    }
  }, [storageKey])

  // Debounced save
  const saveToStorage = useCallback(
    (text) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current)
      saveTimeout.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ content: text }))
        } catch {
          // Storage full
        }
      }, SAVE_DEBOUNCE_MS)
    },
    [storageKey],
  )

  const handleChange = (e) => {
    const val = e.target.value
    setContent(val)
    saveToStorage(val)
  }

  const charCount = content.length
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/[0.04] bg-black/20 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-all ${
              !preview ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Pencil size={10} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] transition-all ${
              preview ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-white'
            }`}
          >
            <Eye size={10} />
            Preview
          </button>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground/50">
          {wordCount}w · {charCount}c
        </span>
      </div>

      {/* Content */}
      {preview ? (
        <div
          className="flex-1 overflow-y-auto custom-scrollbar p-4 text-xs leading-relaxed text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          placeholder="// start typing..."
          className="flex-1 resize-none bg-transparent p-4 font-mono text-xs leading-relaxed text-white/80 placeholder-muted-foreground/30 focus:outline-none custom-scrollbar"
          spellCheck={false}
        />
      )}
    </div>
  )
}
````

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npx vitest run src/os/apps/__tests__/NotesApp.test.jsx
```

- [ ] **Step 5: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/apps/NotesApp.jsx frontend/src/os/apps/__tests__/NotesApp.test.jsx
git commit -m "feat: add Notes app with markdown preview and localStorage persistence"
```

---

## Task 5: Wire apps into registry and Desktop

**Files:**

- Modify: `frontend/src/os/stores/appRegistry.js`
- Modify: `frontend/src/os/Desktop.jsx`

- [ ] **Step 1: Update app registry**

In `frontend/src/os/stores/appRegistry.js`:

1. Add lazy imports for the 3 new apps (after the existing lazy imports):

```js
const SettingsApp = lazy(() => import('../apps/SettingsApp'))
const SystemMonitorApp = lazy(() => import('../apps/SystemMonitorApp'))
const NotesApp = lazy(() => import('../apps/NotesApp'))
```

2. Update the `settings` entry: change `component: PlaceholderApp` to `component: SettingsApp`
3. Update the `sysmon` entry: change `component: PlaceholderApp` to `component: SystemMonitorApp`
4. Update the `notes` entry: change `component: PlaceholderApp` to `component: NotesApp`

- [ ] **Step 2: Update Desktop to pass windowId and read settings**

In `frontend/src/os/Desktop.jsx`:

1. Add settings store import:

```js
import { useSettingsStore } from './stores/settingsStore'
```

2. Subscribe to settings:

```js
const scanlinesEnabled = useSettingsStore((s) => s.scanlinesEnabled)
const orbsEnabled = useSettingsStore((s) => s.orbsEnabled)
const hydrateSettings = useSettingsStore((s) => s.hydrateSettings)
```

3. Add settings hydration to the existing mount effect (after window hydration):

```js
hydrateSettings()
```

4. Conditionally render wallpaper effects:
   Replace:

```jsx
      <div className="ambient-orbs" />
      <div className="scanlines" />
```

With:

```jsx
{
  orbsEnabled && <div className="ambient-orbs" />
}
{
  scanlinesEnabled && <div className="scanlines" />
}
```

5. Pass `windowId` to app components:
   Replace:

```jsx
<AppComponent appId={win.appId} />
```

With:

```jsx
<AppComponent appId={win.appId} windowId={win.windowId} />
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

- [ ] **Step 5: Run lint**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run lint
```

- [ ] **Step 6: Commit**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add frontend/src/os/stores/appRegistry.js frontend/src/os/Desktop.jsx
git commit -m "feat: wire Settings, System Monitor, and Notes into app registry"
```

---

## Task 6: Final integration test

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run test
```

- [ ] **Step 2: Run build + lint**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus/frontend && npm run build && npm run lint
```

- [ ] **Step 3: Fix any issues**

- [ ] **Step 4: Commit and push**

```bash
cd /Users/raoof.r12/Desktop/Raouf/Nexus && git add -A && git commit -m "chore: Phase 3a complete — Settings, System Monitor, Notes apps"
git push nexus-os codex/bootstrap
```

---

## Summary

| Task      | What it builds                            | Est. time   |
| --------- | ----------------------------------------- | ----------- |
| 1         | Settings store + tests                    | 15 min      |
| 2         | Settings app (appearance, account, about) | 15 min      |
| 3         | System Monitor app (4 panels)             | 15 min      |
| 4         | Notes app + tests                         | 20 min      |
| 5         | Registry + Desktop wiring                 | 10 min      |
| 6         | Integration test + push                   | 10 min      |
| **Total** |                                           | **~85 min** |
