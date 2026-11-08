import { describe, it, expect, beforeEach } from 'vitest'
import {
  useSettingsStore,
  ACCENT_PRESETS,
  WALLPAPER_POSITIONS,
  frameColor,
  wallpaperBackgroundStyle,
} from '../settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.removeProperty('--w7-w-bg')
    document.body.style.removeProperty('--w7-glass-blur')
    delete document.body.dataset.transparency
    useSettingsStore.setState({
      accentColor: 'sky',
      wallpaper: 'aero',
      uiScale: 'default',
      wallpaperPosition: 'fill',
      colorIntensity: 100,
      transparencyEnabled: true,
    })
  })

  it('initializes with the Windows 7 defaults', () => {
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('sky')
    expect(state.wallpaper).toBe('aero')
    expect(state.uiScale).toBe('default')
    expect(state.wallpaperPosition).toBe('fill')
    expect(state.colorIntensity).toBe(100)
    expect(state.transparencyEnabled).toBe(true)
  })

  it('no longer exposes the cyberpunk scanline/orb toggles', () => {
    const state = useSettingsStore.getState()
    expect(state.toggleScanlines).toBeUndefined()
    expect(state.toggleOrbs).toBeUndefined()
  })

  it('setAccentColor updates the window colour and writes the frame variable', () => {
    useSettingsStore.getState().setAccentColor('leaf')
    expect(useSettingsStore.getState().accentColor).toBe('leaf')
    expect(document.body.style.getPropertyValue('--w7-w-bg')).toBe(ACCENT_PRESETS.leaf.frame)
  })

  it('setAccentColor falls back to sky for an unknown colour', () => {
    useSettingsStore.getState().setAccentColor('cyan')
    expect(useSettingsStore.getState().accentColor).toBe('sky')
  })

  it('setUiScale updates the scale', () => {
    useSettingsStore.getState().setUiScale('large')
    expect(useSettingsStore.getState().uiScale).toBe('large')
  })

  it('setWallpaper rejects removed presets', () => {
    useSettingsStore.getState().setWallpaper('mesh')
    expect(useSettingsStore.getState().wallpaper).toBe('aero')
    useSettingsStore.getState().setWallpaper('w3')
    expect(useSettingsStore.getState().wallpaper).toBe('w3')
  })

  it('setWallpaperPosition accepts the five Win7 positions and rejects others', () => {
    const { setWallpaperPosition } = useSettingsStore.getState()
    setWallpaperPosition('tile')
    expect(useSettingsStore.getState().wallpaperPosition).toBe('tile')
    setWallpaperPosition('spin')
    expect(useSettingsStore.getState().wallpaperPosition).toBe('fill')
  })

  it('setWallpaperPosition persists the position', () => {
    useSettingsStore.getState().setWallpaperPosition('stretch')
    const saved = JSON.parse(localStorage.getItem('nexus-os:settings'))
    expect(saved.wallpaperPosition).toBe('stretch')
  })

  it('setColorIntensity clamps to 0–100 and rewrites the frame colour', () => {
    const { setColorIntensity } = useSettingsStore.getState()
    setColorIntensity(40)
    expect(useSettingsStore.getState().colorIntensity).toBe(40)
    expect(document.body.style.getPropertyValue('--w7-w-bg')).toBe(
      frameColor(ACCENT_PRESETS.sky.frame, 40),
    )
    setColorIntensity(250)
    expect(useSettingsStore.getState().colorIntensity).toBe(100)
  })

  it('setTransparencyEnabled(false) drops the blur and marks body as opaque', () => {
    useSettingsStore.getState().setTransparencyEnabled(false)
    expect(useSettingsStore.getState().transparencyEnabled).toBe(false)
    expect(document.body.style.getPropertyValue('--w7-glass-blur')).toBe('0px')
    expect(document.body.dataset.transparency).toBe('off')

    useSettingsStore.getState().setTransparencyEnabled(true)
    expect(document.body.style.getPropertyValue('--w7-glass-blur')).toBe('')
    expect(document.body.dataset.transparency).toBe('on')
  })

  it('hydrateSettings restores from localStorage', () => {
    localStorage.setItem(
      'nexus-os:settings',
      JSON.stringify({ accentColor: 'violet', uiScale: 'compact', wallpaper: 'w2' }),
    )
    useSettingsStore.getState().hydrateSettings()
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('violet')
    expect(state.uiScale).toBe('compact')
    expect(state.wallpaper).toBe('w2')
  })

  it('hydrateSettings restores the appearance and position keys', () => {
    localStorage.setItem(
      'nexus-os:settings',
      JSON.stringify({
        accentColor: 'sea',
        wallpaperPosition: 'center',
        colorIntensity: 30,
        transparencyEnabled: false,
      }),
    )
    useSettingsStore.getState().hydrateSettings()
    const state = useSettingsStore.getState()
    expect(state.wallpaperPosition).toBe('center')
    expect(state.colorIntensity).toBe(30)
    expect(state.transparencyEnabled).toBe(false)
    expect(document.body.dataset.transparency).toBe('off')
  })

  it('hydrateSettings defaults the new keys when they were never saved', () => {
    localStorage.setItem('nexus-os:settings', JSON.stringify({ accentColor: 'sky' }))
    useSettingsStore.getState().hydrateSettings()
    const state = useSettingsStore.getState()
    expect(state.wallpaperPosition).toBe('fill')
    expect(state.colorIntensity).toBe(100)
    expect(state.transparencyEnabled).toBe(true)
  })

  it('hydrateSettings migrates pre-redesign values to Windows 7 defaults', () => {
    localStorage.setItem(
      'nexus-os:settings',
      JSON.stringify({
        accentColor: 'magenta',
        wallpaper: 'mesh',
        uiScale: 'default',
        scanlinesEnabled: true,
        orbsEnabled: true,
      }),
    )
    useSettingsStore.getState().hydrateSettings()
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('sky')
    expect(state.wallpaper).toBe('aero')
  })

  it('hydrateSettings handles corrupt data gracefully', () => {
    localStorage.setItem('nexus-os:settings', 'broken{{{')
    useSettingsStore.getState().hydrateSettings()
    expect(useSettingsStore.getState().accentColor).toBe('sky')
  })
})

describe('frameColor', () => {
  it('returns the preset unchanged at full intensity', () => {
    expect(frameColor('#4580c4', 100)).toBe('#4580c4')
  })

  it('pales the preset as intensity falls', () => {
    const full = frameColor('#1f4f8f', 100)
    const half = frameColor('#1f4f8f', 50)
    const low = frameColor('#1f4f8f', 0)
    expect(half).not.toBe(full)
    expect(low).not.toBe(half)
    expect(low).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('wallpaperBackgroundStyle', () => {
  it('maps every position to a background layout', () => {
    for (const key of Object.keys(WALLPAPER_POSITIONS)) {
      const style = wallpaperBackgroundStyle(key)
      expect(style.backgroundSize).toBeTruthy()
      expect(style.backgroundRepeat).toBeTruthy()
      expect(style.backgroundPosition).toBeTruthy()
    }
  })

  it('tiles only for Tile', () => {
    expect(wallpaperBackgroundStyle('tile').backgroundRepeat).toBe('repeat')
    expect(wallpaperBackgroundStyle('fill').backgroundRepeat).toBe('no-repeat')
  })

  it('falls back to Fill for an unknown position', () => {
    expect(wallpaperBackgroundStyle('spin')).toEqual(wallpaperBackgroundStyle('fill'))
  })
})
