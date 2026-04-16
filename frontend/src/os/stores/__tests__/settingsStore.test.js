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
    localStorage.setItem('nexus-os:settings', JSON.stringify({
      accentColor: 'magenta',
      uiScale: 'compact',
      scanlinesEnabled: false,
      orbsEnabled: false,
    }))
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
