import { describe, it, expect, vi, beforeEach } from 'vitest'
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
