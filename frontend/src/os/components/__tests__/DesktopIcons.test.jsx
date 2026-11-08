import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { getDesktopIconPrefs, resetDesktopPrefsCacheForTests } from '../DesktopMenus/desktopPrefs'

const openApp = vi.fn()

vi.mock('../../stores/windowStore', () => ({
  useWindowStore: (selector) => selector({ openApp, isMobile: false }),
}))

vi.mock('../../stores/appRegistry', () => ({
  APP_REGISTRY: {
    notes: { id: 'notes', title: 'Notes', description: 'Quick notes', tint: [] },
    tasks: { id: 'tasks', title: 'Tasks', description: 'Tasks list', tint: [] },
    settings: { id: 'settings', title: 'Settings', description: 'Personalise', tint: [] },
  },
  APP_ORDER: ['notes', 'tasks', 'settings'],
}))

vi.mock('../AppIcon', () => ({
  default: () => <span data-testid="app-icon" />,
}))

import DesktopIcons from '../DesktopIcons'

const option = (name) => screen.getByRole('option', { name: new RegExp(name) })
const focusOption = (name) => act(() => option(name).focus())

describe('DesktopIcons', () => {
  beforeEach(() => {
    openApp.mockClear()
    localStorage.clear()
    resetDesktopPrefsCacheForTests()
  })

  it('exposes a multi-select listbox of options', () => {
    render(<DesktopIcons />)
    const list = screen.getByRole('listbox', { name: 'Desktop icons' })
    expect(list.getAttribute('aria-multiselectable')).toBe('true')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('selects one icon on click and clears the selection on an empty click', () => {
    render(<DesktopIcons />)
    fireEvent.click(option('Notes'))
    expect(option('Notes').getAttribute('aria-selected')).toBe('true')
    fireEvent.click(option('Tasks'))
    expect(option('Notes').getAttribute('aria-selected')).toBe('false')
    expect(option('Tasks').getAttribute('aria-selected')).toBe('true')
    const grid = screen.getByRole('listbox', { name: 'Desktop icons' })
    fireEvent.pointerDown(grid, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(grid, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    expect(option('Tasks').getAttribute('aria-selected')).toBe('false')
  })

  it('adds to the selection with Ctrl-click', () => {
    render(<DesktopIcons />)
    fireEvent.click(option('Notes'))
    fireEvent.click(option('Tasks'), { ctrlKey: true })
    expect(option('Notes').getAttribute('aria-selected')).toBe('true')
    expect(option('Tasks').getAttribute('aria-selected')).toBe('true')
  })

  it('toggles selection with Space and never opens the app', () => {
    render(<DesktopIcons />)
    focusOption('Notes')
    fireEvent.keyDown(option('Notes'), { key: ' ' })
    expect(option('Notes').getAttribute('aria-selected')).toBe('true')
    expect(openApp).not.toHaveBeenCalled()
  })

  it('opens the app on Enter and on double-click', () => {
    render(<DesktopIcons />)
    fireEvent.keyDown(option('Tasks'), { key: 'Enter' })
    expect(openApp).toHaveBeenLastCalledWith('tasks')
    fireEvent.doubleClick(option('Notes'))
    expect(openApp).toHaveBeenLastCalledWith('notes')
  })

  it('moves between icons with the arrow keys', () => {
    render(<DesktopIcons />)
    focusOption('Notes')
    fireEvent.keyDown(option('Notes'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(option('Tasks'))
    expect(option('Tasks').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(option('Tasks'), { key: 'End' })
    expect(document.activeElement).toBe(option('Settings'))
  })

  it('hides an icon with Delete and keeps it in storage for restore', () => {
    render(<DesktopIcons />)
    focusOption('Tasks')
    fireEvent.keyDown(option('Tasks'), { key: 'Delete' })
    expect(screen.queryByRole('option', { name: /Tasks/ })).toBeNull()
    expect(getDesktopIconPrefs().hidden).toEqual(['tasks'])
  })

  it('renames an icon with F2, saves the label and reflects it', () => {
    render(<DesktopIcons />)
    focusOption('Notes')
    fireEvent.keyDown(option('Notes'), { key: 'F2' })
    const input = screen.getByRole('textbox', { name: 'Name for Notes' })
    fireEvent.change(input, { target: { value: 'Journal' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(getDesktopIconPrefs().labels).toEqual({ notes: 'Journal' })
    expect(screen.getByRole('option', { name: /Journal/ })).toBeTruthy()
    expect(openApp).not.toHaveBeenCalled()
  })

  it('cancels a rename on Escape without saving', () => {
    render(<DesktopIcons />)
    focusOption('Notes')
    fireEvent.keyDown(option('Notes'), { key: 'F2' })
    const input = screen.getByRole('textbox', { name: 'Name for Notes' })
    fireEvent.change(input, { target: { value: 'Nope' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(getDesktopIconPrefs().labels).toEqual({})
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('reports right-clicks on an icon to its parent instead of the desktop', () => {
    const onIconContextMenu = vi.fn()
    render(<DesktopIcons onIconContextMenu={onIconContextMenu} />)
    fireEvent.contextMenu(option('Tasks'), { clientX: 40, clientY: 50 })
    expect(onIconContextMenu).toHaveBeenCalledWith({ x: 40, y: 50, appId: 'tasks' })
    expect(option('Tasks').getAttribute('aria-selected')).toBe('true')
  })

  it('hides every icon when the desktop icons are switched off', () => {
    render(<DesktopIcons />)
    act(() => {
      localStorage.setItem('nexus.desktop.icons', JSON.stringify({ showIcons: false }))
      resetDesktopPrefsCacheForTests()
    })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
