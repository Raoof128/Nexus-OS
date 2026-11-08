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
export const DEFAULT_COLOR_INTENSITY = 100

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

/**
 * Picture position (Personalise → Desktop Background → Picture position).
 * Each entry is the CSS background layout for the desktop wallpaper layer;
 * use `wallpaperBackgroundStyle(position)` to get it as a style object.
 */
export const WALLPAPER_POSITIONS = {
  fill: { label: 'Fill', size: 'cover', repeat: 'no-repeat', position: 'center' },
  fit: { label: 'Fit', size: 'contain', repeat: 'no-repeat', position: 'center' },
  stretch: { label: 'Stretch', size: '100% 100%', repeat: 'no-repeat', position: 'center' },
  tile: { label: 'Tile', size: 'auto', repeat: 'repeat', position: 'left top' },
  center: { label: 'Center', size: 'auto', repeat: 'no-repeat', position: 'center' },
}

export const DEFAULT_WALLPAPER_POSITION = 'fill'

// How far "Color intensity" pulls the frame towards pale grey at its lowest
// setting. 100 leaves the preset colour exactly as designed.
const PALE_MIX = 0.7
const PALE_TARGET = [0xe6, 0xec, 0xf3]

function normaliseAccent(key) {
  return key && ACCENT_PRESETS[key] ? key : DEFAULT_ACCENT
}

function normaliseWallpaper(key) {
  return key && !_REMOVED_WALLPAPER_IDS.has(key) && WALLPAPER_PRESETS[key] ? key : DEFAULT_WALLPAPER
}

function normaliseWallpaperPosition(key) {
  return key && WALLPAPER_POSITIONS[key] ? key : DEFAULT_WALLPAPER_POSITION
}

function normaliseColorIntensity(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_COLOR_INTENSITY
  return Math.min(100, Math.max(0, Math.round(n)))
}

function normaliseTransparency(value) {
  return value !== false
}

/** CSS background layout for the desktop wallpaper, from a picture position key. */
export function wallpaperBackgroundStyle(position) {
  const layout = WALLPAPER_POSITIONS[normaliseWallpaperPosition(position)]
  return {
    backgroundSize: layout.size,
    backgroundRepeat: layout.repeat,
    backgroundPosition: layout.position,
  }
}

/**
 * The frame colour for a preset at a given "Color intensity" (0–100).
 * Lower intensity mixes the preset towards a pale grey-blue; 100 returns the
 * preset hex unchanged.
 */
export function frameColor(hex, intensity = DEFAULT_COLOR_INTENSITY) {
  const amount = ((100 - normaliseColorIntensity(intensity)) / 100) * PALE_MIX
  if (amount === 0) return hex
  const n = parseInt(hex.slice(1), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  const mixed = channels.map((c, i) => Math.round(c + (PALE_TARGET[i] - c) * amount))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function saveToStorage(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accentColor: state.accentColor,
        wallpaper: state.wallpaper,
        uiScale: state.uiScale,
        wallpaperPosition: state.wallpaperPosition,
        colorIntensity: state.colorIntensity,
        transparencyEnabled: state.transparencyEnabled,
      }),
    )
  } catch {
    // Storage unavailable
  }
}

/**
 * Writes the window colour, Color intensity and transparency to <body>.
 * `--w7-w-bg` drives the frame colour; `--w7-glass-blur` drops the blur when
 * transparency is off, and `data-transparency` lets stylesheets make the
 * frame fully opaque.
 */
function applyAppearanceToDOM({ accentColor, colorIntensity, transparencyEnabled }) {
  if (typeof document === 'undefined' || !document.body) return
  const preset = ACCENT_PRESETS[accentColor]
  if (preset) {
    document.body.style.setProperty(
      '--w7-w-bg',
      frameColor(preset.frame, normaliseColorIntensity(colorIntensity)),
    )
  }
  const glass = normaliseTransparency(transparencyEnabled)
  document.body.dataset.transparency = glass ? 'on' : 'off'
  if (glass) {
    document.body.style.removeProperty('--w7-glass-blur')
  } else {
    document.body.style.setProperty('--w7-glass-blur', '0px')
  }
}

function applyUiScaleToDOM(scale) {
  document.documentElement.dataset.uiScale = scale ?? 'default'
}

/** Turns whatever was persisted (possibly stale or partial) into valid settings. */
function normaliseSettings(raw) {
  return {
    accentColor: normaliseAccent(raw.accentColor),
    wallpaper: normaliseWallpaper(raw.wallpaper),
    uiScale: raw.uiScale || 'default',
    wallpaperPosition: normaliseWallpaperPosition(raw.wallpaperPosition),
    colorIntensity: normaliseColorIntensity(raw.colorIntensity ?? DEFAULT_COLOR_INTENSITY),
    transparencyEnabled: normaliseTransparency(raw.transparencyEnabled),
  }
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

const _persisted = readPersistedSettings()
const _boot = normaliseSettings(_persisted)

applyAppearanceToDOM(_boot)
applyUiScaleToDOM(_persisted.uiScale ?? 'default')

// ── Store ─────────────────────────────────────────────────────────────────────
export const useSettingsStore = create((set, get) => ({
  accentColor: _boot.accentColor,
  wallpaper: _boot.wallpaper,
  uiScale: _persisted.uiScale ?? 'default',
  wallpaperPosition: _boot.wallpaperPosition,
  colorIntensity: _boot.colorIntensity,
  transparencyEnabled: _boot.transparencyEnabled,

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

  setWallpaperPosition: (position) => {
    set({ wallpaperPosition: normaliseWallpaperPosition(position) })
    saveToStorage(get())
  },

  setAccentColor: (color) => {
    const next = normaliseAccent(color)
    set({ accentColor: next })
    applyAppearanceToDOM(get())
    saveToStorage(get())
  },

  setColorIntensity: (value) => {
    set({ colorIntensity: normaliseColorIntensity(value) })
    applyAppearanceToDOM(get())
    saveToStorage(get())
  },

  setTransparencyEnabled: (enabled) => {
    set({ transparencyEnabled: normaliseTransparency(enabled) })
    applyAppearanceToDOM(get())
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
      const next = normaliseSettings(saved)
      set({ ...next, uiScale: saved.uiScale || 'default' })
      applyAppearanceToDOM(next)
    } catch {
      // Corrupt data
    }
  },
}))
