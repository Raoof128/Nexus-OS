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
