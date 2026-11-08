import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Shared mutable mock state (hoisted so the vi.mock factories can read it).
const m = vi.hoisted(() => ({ items: [], loading: false, update: null, move: null }))

vi.mock('../hooks/useTasks', () => ({
  useTaskItems: () => ({ data: m.items, isLoading: m.loading }),
  useTaskMutations: () => ({
    createTask: { mutate: vi.fn() },
    updateTask: m.update,
    moveTask: m.move,
    deleteTask: { mutate: vi.fn() },
    clearCompleted: { mutate: vi.fn() },
  }),
}))
vi.mock('../hooks/useTaskReminders', () => ({ useTaskReminders: () => {} }))
vi.mock('../components/QuickAddBar', () => ({ default: () => null }))

import TaskListView from './TaskListView'

const base = { list_id: 'a', starred: false, recurrence: null, position: 1 }

// The Tasks window root supplies rootRef; the keyboard shortcuts listen on it.
function Harness() {
  const ref = useRef(null)
  return (
    <div ref={ref}>
      <TaskListView listId="a" listName="Home" rootRef={ref} />
    </div>
  )
}

describe('TaskListView', () => {
  beforeEach(() => {
    m.loading = false
    m.items = []
    m.update = { mutate: vi.fn() }
    m.move = { mutate: vi.fn() }
  })

  it('uses one Win7 marquee progress bar while loading', () => {
    m.loading = true
    render(<Harness />)
    const bar = screen.getByRole('progressbar', { name: 'Loading tasks' })
    expect(bar.classList.contains('marquee')).toBe(true)
    expect(screen.getByText('Loading tasks…')).not.toBeNull()
  })

  it('never nests a list item directly inside another, including subtasks', () => {
    m.items = [
      { ...base, id: 'p1', title: 'Parent', status: 'needsAction', parent_id: null },
      { ...base, id: 'c1', title: 'Child', status: 'needsAction', parent_id: 'p1', position: 2 },
      { ...base, id: 'p2', title: 'Second', status: 'needsAction', parent_id: null, position: 3 },
    ]
    const { container } = render(<Harness />)
    expect(container.querySelectorAll('li > li')).toHaveLength(0)
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)
    expect(container.querySelector('li[data-task-id="c1"]').parentElement.tagName).toBe('UL')
  })

  it('keeps completed rows as direct list items of their list', () => {
    m.items = [{ ...base, id: 'd1', title: 'Done', status: 'completed', parent_id: null }]
    const { container } = render(<Harness />)
    expect(container.querySelectorAll('li > li')).toHaveLength(0)
    expect(container.querySelector('li[data-task-id="d1"]').parentElement.tagName).toBe('UL')
  })

  it('does not toggle a task when Space lands on one of its row buttons', () => {
    m.items = [{ ...base, id: 'p1', title: 'Parent', status: 'needsAction', parent_id: null }]
    render(<Harness />)
    const del = screen.getByRole('button', { name: 'Star "Parent"' })
    fireEvent.focusIn(del)
    fireEvent.keyDown(del, { key: ' ' })
    expect(m.update.mutate).not.toHaveBeenCalled()
  })

  it('toggles the focused task on Space when focus is on the row itself', () => {
    m.items = [{ ...base, id: 'p1', title: 'Parent', status: 'needsAction', parent_id: null }]
    const { container } = render(<Harness />)
    const star = screen.getByRole('button', { name: 'Star "Parent"' })
    fireEvent.focusIn(star)
    fireEvent.keyDown(container.querySelector('[data-task-id="p1"]'), { key: ' ' })
    expect(m.update.mutate).toHaveBeenCalledWith({
      id: 'p1',
      patch: { status: 'completed' },
    })
  })

  it('ignores the list shortcuts for keys pressed inside an open row menu', () => {
    m.items = [{ ...base, id: 'p1', title: 'Parent', status: 'needsAction', parent_id: null }]
    render(<Harness />)
    const star = screen.getByRole('button', { name: 'Star "Parent"' })
    fireEvent.focusIn(star)
    // A menu rendered inside the row: keys from it must not reach the list.
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = document.createElement('button')
    menu.appendChild(item)
    star.parentElement.appendChild(menu)
    fireEvent.keyDown(item, { key: 's' })
    fireEvent.keyDown(item, { key: ' ' })
    expect(m.update.mutate).not.toHaveBeenCalled()
  })
})
