import { create } from 'zustand'

const STORAGE_KEY = 'nexus-os:settings'

export const ACCENT_PRESETS = {
  yellow: { primary: '56 100% 48%', neon: '56 100% 48%', label: 'Neon Yellow' },
  cyan: { primary: '180 100% 50%', neon: '180 100% 50%', label: 'Cyber Cyan' },
  magenta: { primary: '300 100% 50%', neon: '300 100% 50%', label: 'Hot Magenta' },
  green: { primary: '120 100% 40%', neon: '120 100% 40%', label: 'Matrix Green' },
  orange: { primary: '30 100% 50%', neon: '30 100% 50%', label: 'Blaze Orange' },
}

// IDs that were removed so stale localStorage values fall back gracefully.
const _REMOVED_WALLPAPER_IDS = new Set(['grid', 'dots', 'solid', 'stars'])

export const WALLPAPER_PRESETS = {
  mesh: { id: 'mesh', label: 'Neural Mesh' },
  w1: { id: 'w1', label: 'Wallpaper 1', image: '/wallpapers/W1.png' },
  w2: { id: 'w2', label: 'Wallpaper 2', image: '/wallpapers/W2.jpg' },
  w3: { id: 'w3', label: 'Wallpaper 3', image: '/wallpapers/W3.jpg' },
  w4: { id: 'w4', label: 'Wallpaper 4', image: '/wallpapers/W4.png' },
  w5: { id: 'w5', label: 'Wallpaper 5', image: '/wallpapers/W5.jpg' },
  w6: { id: 'w6', label: 'Wallpaper 6', image: '/wallpapers/W6.jpg' },
  w7: { id: 'w7', label: 'Wallpaper 7', image: '/wallpapers/W7.jpg' },
  w8: { id: 'w8', label: 'Wallpaper 8', image: '/wallpapers/W8.jpg' },
}

function saveToStorage(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentColor: state.accentColor,
        wallpaper: state.wallpaper,
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

// ── Synchronous boot hydration ────────────────────────────────────────────────
// Read persisted settings from localStorage NOW, at module evaluation time.
// ESM scripts run after DOMContentLoaded so document.documentElement is ready.
// This eliminates the flash of default wallpaper / accent on every page load
// (the previous approach called hydrateSettings() inside a useEffect, which
// fires AFTER the first paint and caused a visible switch from 'grid' to the
// saved wallpaper on every reload).
function readPersistedSettings() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) ?? {}
  } catch {
    return {}
  }
}

const _boot = readPersistedSettings()

// Apply saved accent color immediately so CSS custom properties are correct
// before React renders any component.
if (_boot.accentColor) {
  applyAccentToDOM(_boot.accentColor)
}

// Guard stale wallpaper values — if the user had a removed preset ('grid',
// 'dots', 'solid', 'stars') saved in localStorage, fall back to 'mesh'.
const _savedWallpaper =
  _boot.wallpaper && !_REMOVED_WALLPAPER_IDS.has(_boot.wallpaper) ? _boot.wallpaper : 'mesh'

// ── Store ─────────────────────────────────────────────────────────────────────
export const useSettingsStore = create((set, get) => ({
  accentColor: _boot.accentColor ?? 'yellow',
  wallpaper: _savedWallpaper,
  uiScale: _boot.uiScale ?? 'default',
  scanlinesEnabled: _boot.scanlinesEnabled ?? true,
  orbsEnabled: _boot.orbsEnabled ?? true,

  setWallpaper: (wallpaper) => {
    // Use View Transitions API when available for a smooth wallpaper switch.
    // saveToStorage is called INSIDE the callback so get() captures the new
    // value (the callback is called synchronously by the browser after it
    // captures the "before" screenshot).
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        set({ wallpaper })
        saveToStorage(get())
      })
    } else {
      set({ wallpaper })
      saveToStorage(get())
    }
  },

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

  // hydrateSettings is kept for backward compatibility (tests call it directly).
  // In practice it is a no-op on a fresh load because the store already
  // initialized from localStorage above. It remains useful if another browser
  // tab writes new settings to localStorage mid-session.
  hydrateSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved?.accentColor) return
      const restoredWallpaper =
        saved.wallpaper && !_REMOVED_WALLPAPER_IDS.has(saved.wallpaper) ? saved.wallpaper : 'mesh'
      set({
        accentColor: saved.accentColor,
        wallpaper: restoredWallpaper,
        uiScale: saved.uiScale || 'default',
        scanlinesEnabled: saved.scanlinesEnabled ?? true,
        orbsEnabled: saved.orbsEnabled ?? true,
      })
      applyAccentToDOM(saved.accentColor)
    } catch {
      // Corrupt data
    }
  },
}))
