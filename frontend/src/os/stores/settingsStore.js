import { create } from 'zustand'

const STORAGE_KEY = 'nexus-os:settings'

export const ACCENT_PRESETS = {
  yellow: { primary: '56 100% 48%', neon: '56 100% 48%', label: 'Neon Yellow' },
  cyan: { primary: '180 100% 50%', neon: '180 100% 50%', label: 'Cyber Cyan' },
  magenta: { primary: '300 100% 50%', neon: '300 100% 50%', label: 'Hot Magenta' },
  green: { primary: '120 100% 40%', neon: '120 100% 40%', label: 'Matrix Green' },
  orange: { primary: '30 100% 50%', neon: '30 100% 50%', label: 'Blaze Orange' },
}

export const WALLPAPER_PRESETS = {
  grid: { id: 'grid', label: 'Matrix Grid' },
  dots: { id: 'dots', label: 'Circuit Dots' },
  solid: { id: 'solid', label: 'Deep Void' },
  mesh: { id: 'mesh', label: 'Neural Mesh' },
  stars: { id: 'stars', label: 'Starfield' },
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

export const useSettingsStore = create((set, get) => ({
  accentColor: 'yellow',
  wallpaper: 'grid',
  uiScale: 'default',
  scanlinesEnabled: true,
  orbsEnabled: true,

  setWallpaper: (wallpaper) => {
    // 2026 Best Practice: Use View Transitions if available for premium feel.
    // saveToStorage must be called INSIDE the callback — the callback runs
    // asynchronously, so calling get() outside would capture the old value.
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

  hydrateSettings: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.accentColor) {
        set({
          accentColor: saved.accentColor,
          wallpaper: saved.wallpaper || 'grid',
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
