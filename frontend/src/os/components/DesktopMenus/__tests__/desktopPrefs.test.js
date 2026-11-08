import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getDesktopIconPrefs,
  hideDesktopIcon,
  iconTitle,
  isIdleLockEnabled,
  refreshDesktopIcons,
  renameDesktopIcon,
  resetDesktopPrefsCacheForTests,
  restoreDesktopIcons,
  setDesktopIconSort,
  setDesktopIconsShown,
  setIdleLockEnabled,
} from '../desktopPrefs'

const KEY = 'nexus.desktop.icons'

describe('desktopPrefs', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDesktopPrefsCacheForTests()
  })

  it('starts with every icon shown, manual order and no overrides', () => {
    const prefs = getDesktopIconPrefs()
    expect(prefs.showIcons).toBe(true)
    expect(prefs.sort).toBe('manual')
    expect(prefs.hidden).toEqual([])
    expect(prefs.labels).toEqual({})
  })

  it('hides an icon once and restores all hidden icons', () => {
    hideDesktopIcon('notes')
    hideDesktopIcon('notes')
    expect(getDesktopIconPrefs().hidden).toEqual(['notes'])
    restoreDesktopIcons()
    expect(getDesktopIconPrefs().hidden).toEqual([])
  })

  it('persists changes to localStorage without the session revision', () => {
    hideDesktopIcon('notes')
    refreshDesktopIcons()
    const stored = JSON.parse(localStorage.getItem(KEY))
    expect(stored.hidden).toEqual(['notes'])
    expect(stored).not.toHaveProperty('revision')
  })

  it('keeps in-session changes on Refresh when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    hideDesktopIcon('notes')
    refreshDesktopIcons()
    expect(getDesktopIconPrefs().hidden).toEqual(['notes'])
    expect(getDesktopIconPrefs().revision).toBe(1)
    spy.mockRestore()
  })

  it('stores a rename and removes it when the name is cleared or equals the title', () => {
    renameDesktopIcon('notes', '  Journal  ', 'Notes')
    expect(getDesktopIconPrefs().labels).toEqual({ notes: 'Journal' })
    renameDesktopIcon('notes', '   ', 'Notes')
    expect(getDesktopIconPrefs().labels).toEqual({})
    renameDesktopIcon('notes', 'Notes', 'Notes')
    expect(getDesktopIconPrefs().labels).toEqual({})
  })

  it('caps label length at 60 characters', () => {
    renameDesktopIcon('notes', 'x'.repeat(100), 'Notes')
    expect(getDesktopIconPrefs().labels.notes).toHaveLength(60)
  })

  it('falls back to the app title when there is no rename', () => {
    expect(iconTitle('notes', getDesktopIconPrefs(), 'Notes')).toBe('Notes')
    renameDesktopIcon('notes', 'Journal', 'Notes')
    expect(iconTitle('notes', getDesktopIconPrefs(), 'Notes')).toBe('Journal')
  })

  it('toggles icon visibility and sort order, rejecting unknown sorts', () => {
    setDesktopIconsShown(false)
    expect(getDesktopIconPrefs().showIcons).toBe(false)
    setDesktopIconSort('name')
    setDesktopIconSort('bogus')
    expect(getDesktopIconPrefs().sort).toBe('name')
  })

  it('tolerates corrupt storage and keeps working', () => {
    localStorage.setItem(KEY, '{not json')
    resetDesktopPrefsCacheForTests()
    expect(getDesktopIconPrefs().hidden).toEqual([])
    hideDesktopIcon('media')
    expect(getDesktopIconPrefs().hidden).toEqual(['media'])
  })

  it('drops malformed fields from storage', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ hidden: ['a', 3, 'a'], labels: { a: '  ', b: 'Kept', c: 7 }, sort: 'x' }),
    )
    resetDesktopPrefsCacheForTests()
    const prefs = getDesktopIconPrefs()
    expect(prefs.hidden).toEqual(['a'])
    expect(prefs.labels).toEqual({ b: 'Kept' })
    expect(prefs.sort).toBe('manual')
  })

  it('has the idle lock switched off by default', () => {
    expect(isIdleLockEnabled()).toBe(false)
    setIdleLockEnabled(true)
    expect(isIdleLockEnabled()).toBe(true)
    setIdleLockEnabled(false)
    expect(isIdleLockEnabled()).toBe(false)
  })
})
