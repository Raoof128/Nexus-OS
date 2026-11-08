import { create } from 'zustand'

const STORAGE_KEY = 'nexus-os:settings'

/**
 * Window colours (Personalise → Window Color in Windows 7).
 * `frame` is written to `--w7-w-bg` on <body>, which 7.css uses for every
 * window frame and title bar; the taskbar and Start menu mix it into their
 * glass. Content colours (links, selection) stay Win7 blue regardless.
 * The store keeps the historical `accentColor` name so persisted settings and
 * callers keep working.
 */
export const ACCENT_PRESETS = {
  sky: { frame: '#4580c4', label: 'Sky' },
  twilight: { frame: '#1f4f8f', label: 'Twilight' },
  sea: { frame: '#2f8f8a', label: 'Sea' },
  leaf: { frame: '#4c8f3a', label: 'Leaf' },
  lime: { frame: '#8bb236', label: 'Lime' },
  sun: { frame: '#d9a521', label: 'Sun' },
  pumpkin: { frame: '#d9701e', label: 'Pumpkin' },
  blush: { frame: '#c74c6e', label: 'Blush' },
  violet: { frame: '#7a4bb0', label: 'Violet' },
  slate: { frame: '#5e6b7a', label: 'Slate' },
  frost: { frame: '#9fb5c9', label: 'Frost' },
}

export const DEFAULT_ACCENT = 'sky'
export const DEFAULT_WALLPAPER = 'aero'

// IDs that were removed so stale localStorage values fall back gracefully.
// `mesh` was the cyberpunk CSS pattern from before the Windows 7 redesign.
const _REMOVED_WALLPAPER_IDS = new Set(['grid', 'dots', 'solid', 'stars', 'mesh'])

export const WALLPAPER_PRESETS = {
  aero: { id: 'aero', label: 'Aero', image: '/wallpapers/aero.svg' },
  w1: { id: 'w1', label: 'Wallpaper 1', image: '/wallpapers/W1.png' },
  w2: { id: 'w2', label: 'Wallpaper 2', image: '/wallpapers/W2.jpg' },
  w3: { id: 'w3', label: 'Wallpaper 3', image: '/wallpapers/W3.jpg' },
  w4: { id: 'w4', label: 'Wallpaper 4', image: '/wallpapers/W4.png' },
  w5: { id: 'w5', label: 'Wallpaper 5', image: '/wallpapers/W5.jpg' },
  w6: { id: 'w6', label: 'Wallpaper 6', image: '/wallpapers/W6.jpg' },
  w7: { id: 'w7', label: 'Wallpaper 7', image: '/wallpapers/W7.jpg' },
  w8: { id: 'w8', label: 'Wallpaper 8', image: '/wallpapers/W8.jpg' },
}

function normaliseAccent(key) {
  return key && ACCENT_PRESETS[key] ? key : DEFAULT_ACCENT
}

function normaliseWallpaper(key) {
  return key && !_REMOVED_WALLPAPER_IDS.has(key) && WALLPAPER_PRESETS[key] ? key : DEFAULT_WALLPAPER
}

function saveToStorage(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentColor: state.accentColor,
        wallpaper: state.wallpaper,
        uiScale: state.uiScale,
      }),
    )
  } catch {
    // Storage unavailable
  }
}

function applyAccentToDOM(colorKey) {
  const preset = ACCENT_PRESETS[colorKey]
  if (!preset || typeof document === 'undefined' || !document.body) return
  document.body.style.setProperty('--w7-w-bg', preset.frame)
}

function applyUiScaleToDOM(scale) {
  document.documentElement.dataset.uiScale = scale ?? 'default'
}

// ── Synchronous boot hydration ────────────────────────────────────────────────
// Read persisted settings from localStorage NOW, at module evaluation time, so
// the saved window colour and wallpaper are applied before the first paint.
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
const _bootAccent = normaliseAccent(_boot.accentColor)

applyAccentToDOM(_bootAccent)
applyUiScaleToDOM(_boot.uiScale ?? 'default')

// ── Store ─────────────────────────────────────────────────────────────────────
export const useSettingsStore = create((set, get) => ({
  accentColor: _bootAccent,
  wallpaper: normaliseWallpaper(_boot.wallpaper),
  uiScale: _boot.uiScale ?? 'default',

  setWallpaper: (wallpaper) => {
    const next = normaliseWallpaper(wallpaper)
    // View Transitions give the wallpaper switch a cross-fade where supported.
    // saveToStorage runs inside the callback so get() sees the new value.
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        set({ wallpaper: next })
        saveToStorage(get())
      })
    } else {
      set({ wallpaper: next })
      saveToStorage(get())
    }
  },

  setAccentColor: (color) => {
    const next = normaliseAccent(color)
    set({ accentColor: next })
    applyAccentToDOM(next)
    saveToStorage(get())
  },

  setUiScale: (scale) => {
    set({ uiScale: scale })
    applyUiScaleToDOM(scale)
    saveToStorage(get())
  },

  // Re-read settings another tab may have written. Also called by tests.
  hydrateSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (!saved || typeof saved !== 'object') return
      const accentColor = normaliseAccent(saved.accentColor)
      set({
        accentColor,
        wallpaper: normaliseWallpaper(saved.wallpaper),
        uiScale: saved.uiScale || 'default',
      })
      applyAccentToDOM(accentColor)
    } catch {
      // Corrupt data
    }
  },
}))
