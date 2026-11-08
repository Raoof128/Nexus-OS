import { describe, it, expect } from 'vitest'

import { busyPercent, heapStats, pushHistory } from '../SystemMonitor/useSystemSamples'
import { ctrlTabTarget, listKeyTarget, tabKeyTarget, wrapIndex } from '../SystemMonitor/keyboard'
import {
  apiServiceState,
  formatDeviceMemory,
  formatMegabytes,
  sessionServiceState,
} from '../SystemMonitor/format'
import { TABS, TAB_IDS, tabButtonId, tabPanelId } from '../SystemMonitor/constants'

describe('SystemMonitor constants', () => {
  it('keeps Windows 7 tab order with Applications first', () => {
    expect(TAB_IDS).toEqual([
      'applications',
      'processes',
      'services',
      'performance',
      'networking',
      'users',
    ])
    expect(TABS[0].label).toBe('Applications')
  })

  it('builds matching button and panel ids', () => {
    expect(tabButtonId('services')).toBe('sysmon-tab-services')
    expect(tabPanelId('services')).toBe('sysmon-panel-services')
  })
})

describe('busyPercent', () => {
  it('is zero with no long tasks', () => {
    expect(busyPercent([], 5000, 1000)).toBe(0)
  })

  it('sums long tasks that overlap the window and clips them to it', () => {
    // Window is 4000 to 5000. Task A covers 4800 to 5300, which is 200 ms inside.
    // Task B covers 3000 to 4100, which is 100 ms inside.
    const tasks = [
      { startTime: 4800, duration: 500 },
      { startTime: 3000, duration: 1100 },
    ]
    expect(busyPercent(tasks, 5000, 1000)).toBe(30)
  })

  it('caps at 100 and rejects a non-positive window', () => {
    expect(busyPercent([{ startTime: 0, duration: 9000 }], 5000, 1000)).toBe(100)
    expect(busyPercent([], 5000, 0)).toBe(0)
  })
})

describe('pushHistory', () => {
  it('appends and keeps only the newest values', () => {
    expect(pushHistory([1, 2], 3, 3)).toEqual([1, 2, 3])
    expect(pushHistory([1, 2, 3], 4, 3)).toEqual([2, 3, 4])
  })

  it('does not mutate the previous history', () => {
    const previous = [1, 2]
    pushHistory(previous, 3)
    expect(previous).toEqual([1, 2])
  })
})

describe('heapStats', () => {
  it('returns null when the browser does not expose heap figures', () => {
    expect(heapStats(undefined)).toBeNull()
  })

  it('computes used percent of the limit', () => {
    expect(heapStats({ usedJSHeapSize: 25, jsHeapSizeLimit: 100 })).toEqual({
      usedBytes: 25,
      limitBytes: 100,
      percent: 25,
    })
  })
})

describe('keyboard targets', () => {
  it('wraps indexes in both directions', () => {
    expect(wrapIndex(-1, 6)).toBe(5)
    expect(wrapIndex(6, 6)).toBe(0)
  })

  it('maps arrow, Home and End keys for tabs', () => {
    expect(tabKeyTarget('ArrowRight', 'users', TAB_IDS)).toBe('applications')
    expect(tabKeyTarget('ArrowLeft', 'applications', TAB_IDS)).toBe('users')
    expect(tabKeyTarget('Home', 'users', TAB_IDS)).toBe('applications')
    expect(tabKeyTarget('End', 'applications', TAB_IDS)).toBe('users')
    expect(tabKeyTarget('a', 'applications', TAB_IDS)).toBeNull()
  })

  it('maps Ctrl+Tab forwards and Ctrl+Shift+Tab backwards', () => {
    expect(ctrlTabTarget({ key: 'Tab', ctrlKey: true }, 'processes', TAB_IDS)).toBe('services')
    expect(ctrlTabTarget({ key: 'Tab', ctrlKey: true, shiftKey: true }, 'processes', TAB_IDS)).toBe(
      'applications',
    )
    expect(ctrlTabTarget({ key: 'Tab' }, 'processes', TAB_IDS)).toBeNull()
    expect(
      ctrlTabTarget({ key: 'Tab', ctrlKey: true, altKey: true }, 'processes', TAB_IDS),
    ).toBeNull()
  })

  it('clamps list rows at the ends instead of wrapping', () => {
    expect(listKeyTarget('ArrowDown', 2, 3)).toBe(2)
    expect(listKeyTarget('ArrowUp', 0, 3)).toBe(0)
    expect(listKeyTarget('ArrowDown', 0, 3)).toBe(1)
    expect(listKeyTarget('End', 0, 3)).toBe(2)
    expect(listKeyTarget('Home', 2, 3)).toBe(0)
    expect(listKeyTarget('ArrowDown', 0, 0)).toBeNull()
  })
})

describe('service state vocabulary', () => {
  it('maps the API health states to Windows service states', () => {
    expect(apiServiceState('online')).toBe('running')
    expect(apiServiceState('offline')).toBe('stopped')
    expect(apiServiceState('checking')).toBe('starting')
    expect(apiServiceState('anything else')).toBe('unknown')
  })

  it('maps the sign-in session to running or stopped', () => {
    expect(sessionServiceState(true)).toBe('running')
    expect(sessionServiceState(false)).toBe('stopped')
  })
})

describe('formatters', () => {
  it('formats memory in megabytes', () => {
    expect(formatMegabytes(17 * 1048576)).toBe('17 MB')
  })

  it('caps the installed memory bucket at 8 GB or more', () => {
    expect(formatDeviceMemory(8)).toBe('8 GB or more')
    expect(formatDeviceMemory(4)).toBe('4 GB')
    expect(formatDeviceMemory(undefined)).toBe('—')
  })
})
