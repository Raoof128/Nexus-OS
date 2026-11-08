import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// Shared mutable mock state (hoisted so the vi.mock factories can read it).
const m = vi.hoisted(() => ({ lists: [] }))

const mutations = () => ({
  createList: { mutate: vi.fn() },
  deleteList: { mutate: vi.fn() },
  reorderList: { mutate: vi.fn() },
  createTask: { mutate: vi.fn() },
  updateTask: { mutate: vi.fn() },
  moveTask: { mutate: vi.fn() },
  deleteTask: { mutate: vi.fn() },
  clearCompleted: { mutate: vi.fn() },
})

vi.mock('./hooks/useTasks', () => ({
  useTaskLists: () => ({ data: m.lists }),
  useTaskItems: () => ({ data: [], isLoading: false }),
  useTaskMutations: () => mutations(),
}))
vi.mock('./hooks/useTaskReminders', () => ({ useTaskReminders: () => {} }))

import TasksApp from './TasksApp'

const LISTS = [
  { id: 'a', name: 'Home', position: 1 },
  { id: 'b', name: 'Work', position: 2 },
]

describe('TasksApp narrow list switcher', () => {
  beforeEach(() => {
    m.lists = LISTS
  })

  it('keeps the list rail out of the flow and offers a Lists toggle below the breakpoint', () => {
    render(<TasksApp />)
    const toggle = screen.getByRole('button', { name: 'Lists' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const rail = document.getElementById(toggle.getAttribute('aria-controls'))
    expect(rail.classList.contains('hidden')).toBe(true)
    expect(rail.classList.contains('absolute')).toBe(false)
  })

  it('opens the rail as an overlay, moves focus into it, and closes on Escape', () => {
    render(<TasksApp />)
    const toggle = screen.getByRole('button', { name: 'Lists' })
    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const rail = document.getElementById(toggle.getAttribute('aria-controls'))
    expect(rail.classList.contains('absolute')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Home' }))

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(rail.classList.contains('hidden')).toBe(true)
    expect(document.activeElement).toBe(toggle)
  })

  it('closes the overlay after picking a list and selects it', () => {
    render(<TasksApp />)
    const toggle = screen.getByRole('button', { name: 'Lists' })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Work' }))

    // The list view re-keys on selection, so re-query the toggle.
    const after = screen.getByRole('button', { name: 'Lists' })
    expect(after.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('button', { name: 'Work' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('heading', { name: 'Work' })).not.toBeNull()
    expect(document.activeElement).toBe(after)
  })

  it('closes from the scrim behind the overlay', () => {
    const { container } = render(<TasksApp />)
    const toggle = screen.getByRole('button', { name: 'Lists' })
    fireEvent.click(toggle)
    const scrim = container.querySelector('[aria-hidden="true"].absolute')
    act(() => fireEvent.click(scrim))
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
  })
})

describe('TasksApp narrow list overlay accessibility', () => {
  beforeEach(() => {
    m.lists = LISTS
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const openOverlay = () => {
    render(<TasksApp />)
    const toggle = screen.getByRole('button', { name: 'Lists' })
    fireEvent.click(toggle)
    const dialog = screen.getByRole('dialog', { name: 'Task lists' })
    return { toggle, dialog }
  }

  it('exposes the open overlay as a modal dialog and not while closed', () => {
    render(<TasksApp />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    const dialog = screen.getByRole('dialog', { name: 'Task lists' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('role')).toBe('dialog')
  })

  it('wraps Tab from the last focusable control back to the first, and Shift+Tab the other way', () => {
    const { dialog } = openOverlay()
    const focusable = [...dialog.querySelectorAll('button:not(:disabled)')]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    expect(first.textContent).toContain('New list')

    act(() => last.focus())
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('keeps focus inside the overlay when Tab is pressed from a control in it', () => {
    const { dialog } = openOverlay()
    const inside = dialog.querySelectorAll('button:not(:disabled)')
    act(() => inside[1].focus())
    fireEvent.keyDown(inside[1], { key: 'Tab' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('Escape in the New list input cancels the form and returns focus to the New list button', () => {
    const { toggle } = openOverlay()

    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    const input = screen.getByRole('textbox', { name: 'New list name' })
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'New list name' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New list' }))
    // Escape only cancelled the form: the overlay stays open and the root did not close it.
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog', { name: 'Task lists' })).not.toBeNull()
  })

  it('the close button dismisses the overlay and returns focus to the Lists toggle', () => {
    const { toggle } = openOverlay()
    fireEvent.click(screen.getByRole('button', { name: 'Close task lists' }))

    expect(screen.getByRole('button', { name: 'Lists' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lists' }))
    expect(document.activeElement).toBe(toggle)
  })

  it('closes the overlay when the rail becomes static (window widened past @md)', () => {
    let resizeCallback = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb) {
          resizeCallback = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    const { dialog } = openOverlay()

    // Narrow: the rail is positioned as an overlay, so it stays open.
    dialog.style.position = 'absolute'
    act(() => resizeCallback())
    expect(screen.getByRole('dialog', { name: 'Task lists' })).not.toBeNull()

    // Wide: the rail is static again, so no modal trap or dialog role may persist.
    dialog.style.position = 'static'
    act(() => resizeCallback())
    expect(screen.getByRole('button', { name: 'Lists' }).getAttribute('aria-expanded')).toBe(
      'false',
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
