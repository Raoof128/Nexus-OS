import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore, ACCENT_PRESETS } from '../settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.removeProperty('--w7-w-bg')
    useSettingsStore.setState({
      accentColor: 'sky',
      wallpaper: 'aero',
      uiScale: 'default',
    })
  })

  it('initializes with the Windows 7 defaults', () => {
    const state = useSettingsStore.getState()
    expect(state.accentColor).toBe('sky')
    expect(state.wallpaper).toBe('aero')
    expect(state.uiScale).toBe('default')
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
