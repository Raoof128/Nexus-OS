import { describe, it, expect, vi } from 'vitest'
import { buildDesktopMenu, buildIconMenu, buildTaskbarMenu, toggleShowDesktop } from '../menuModels'

const prefs = { showIcons: true, sort: 'manual', hidden: [], labels: {}, revision: 0 }

function makeActions() {
  return {
    openApp: vi.fn(),
    cascadeWindows: vi.fn(),
    showDesktop: vi.fn(),
    setIconsShown: vi.fn(),
    setSort: vi.fn(),
    restoreIcons: vi.fn(),
    refresh: vi.fn(),
    hideIcon: vi.fn(),
    rename: vi.fn(),
  }
}

function flatten(items) {
  return items.flatMap((item) => (item.type === 'separator' ? [] : [item, ...(item.items || [])]))
}

describe('desktop menu', () => {
  it('follows the Windows 7 desktop order and has no destructive window commands', () => {
    const menu = buildDesktopMenu({ prefs, actions: makeActions() })
    const labels = menu.items.map((i) => i.label ?? '---')
    expect(labels).toEqual([
      '&View',
      '&Sort by',
      '&Refresh',
      '---',
      '&New',
      '---',
      'Screen re&solution',
      '&Personalize',
    ])
    const all = flatten(menu.items).map((i) => i.label)
    expect(all.join(' ')).not.toMatch(/Close all|Cascade|Show the de|Task Manager/)
  })

  it('disables New and Restore hidden icons when nothing is hidden', () => {
    const menu = buildDesktopMenu({ prefs, actions: makeActions() })
    const byId = Object.fromEntries(flatten(menu.items).map((i) => [i.id, i]))
    expect(byId.new.disabled).toBe(true)
    expect(byId['view.restore'].disabled).toBe(true)
  })

  it('enables Restore hidden icons when icons are hidden', () => {
    const menu = buildDesktopMenu({
      prefs: { ...prefs, hidden: ['notes'] },
      actions: makeActions(),
    })
    const restore = flatten(menu.items).find((i) => i.id === 'view.restore')
    expect(restore.disabled).toBe(false)
  })

  it('maps Personalize and Screen resolution to the Settings app', () => {
    const actions = makeActions()
    const menu = buildDesktopMenu({ prefs, actions })
    flatten(menu.items)
      .filter((i) => i.id === 'personalize' || i.id === 'resolution')
      .forEach((i) => i.onSelect())
    expect(actions.openApp).toHaveBeenCalledWith('settings')
    expect(actions.openApp).toHaveBeenCalledTimes(2)
  })

  it('reports the sort order as a radio group', () => {
    const menu = buildDesktopMenu({ prefs: { ...prefs, sort: 'name' }, actions: makeActions() })
    const names = flatten(menu.items).filter((i) => i.id.startsWith('sort.'))
    expect(names.find((i) => i.id === 'sort.name').checked).toBe(true)
    expect(names.find((i) => i.id === 'sort.manual').checked).toBe(false)
  })
})

describe('icon menu', () => {
  it('offers Open, Delete (hide) and Rename, with Open in bold', () => {
    const actions = makeActions()
    const menu = buildIconMenu({ appId: 'notes', title: 'Notes', prefs, actions })
    const items = menu.items.filter((i) => i.type !== 'separator')
    expect(items.map((i) => i.id)).toEqual(['open', 'delete', 'rename'])
    expect(items[0].bold).toBe(true)
    items[0].onSelect()
    items[1].onSelect()
    items[2].onSelect()
    expect(actions.openApp).toHaveBeenCalledWith('notes')
    expect(actions.hideIcon).toHaveBeenCalledWith('notes')
    expect(actions.rename).toHaveBeenCalledWith('notes')
  })
})

describe('taskbar menu', () => {
  it('offers cascade, show desktop, task manager and a disabled lock toggle', () => {
    const actions = makeActions()
    const menu = buildTaskbarMenu({ actions })
    const items = flatten(menu.items)
    expect(items.map((i) => i.id)).toEqual(['cascade', 'showdesktop', 'taskmgr', 'lock'])
    expect(items.find((i) => i.id === 'lock').disabled).toBe(true)
    items.find((i) => i.id === 'taskmgr').onSelect()
    expect(actions.openApp).toHaveBeenCalledWith('sysmon')
  })
})

describe('toggleShowDesktop', () => {
  it('minimises when something is visible', () => {
    const minimizeAll = vi.fn()
    const restoreDesktop = vi.fn()
    toggleShowDesktop({
      zStack: ['a'],
      windows: { a: { state: 'normal' } },
      minimizeAll,
      restoreDesktop,
    })
    expect(minimizeAll).toHaveBeenCalled()
    expect(restoreDesktop).not.toHaveBeenCalled()
  })

  it('restores when everything is already minimised and something was hidden', () => {
    const minimizeAll = vi.fn()
    const restoreDesktop = vi.fn(() => true)
    toggleShowDesktop({
      zStack: ['a'],
      windows: { a: { state: 'minimized' } },
      minimizeAll,
      restoreDesktop,
    })
    expect(restoreDesktop).toHaveBeenCalled()
    expect(minimizeAll).not.toHaveBeenCalled()
  })
})
