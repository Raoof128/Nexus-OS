import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Shared mutable mock state (hoisted so the vi.mock factories can read it).
const m = vi.hoisted(() => ({
  items: [],
  loading: false,
  error: false,
  refetch: null,
  update: null,
  move: null,
  del: null,
}))

vi.mock('../hooks/useTasks', () => ({
  useTaskItems: () => ({
    data: m.items,
    isLoading: m.loading,
    isError: m.error,
    refetch: m.refetch,
  }),
  useTaskMutations: () => ({
    createTask: { mutate: vi.fn() },
    updateTask: m.update,
    moveTask: m.move,
    deleteTask: m.del,
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
    m.error = false
    m.refetch = vi.fn()
    m.items = []
    m.update = { mutate: vi.fn() }
    m.move = { mutate: vi.fn() }
    m.del = { mutate: vi.fn() }
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

  it('says why a save failed instead of rolling back silently', () => {
    m.move = {
      mutate: vi.fn(),
      isError: true,
      error: new Error('Subtasks must stay in their parent list'),
    }
    render(<Harness />)
    expect(screen.getByRole('alert').textContent).toBe(
      "Couldn't save the change. Subtasks must stay in their parent list",
    )
  })

  it('shows edited title, star and due from the cache without remounting the row', () => {
    m.items = [{ ...base, id: 'p1', title: 'Old title', status: 'needsAction', parent_id: null }]
    const { container, rerender } = render(<Harness />)
    const before = container.querySelector('[data-task-id="p1"]')
    expect(before).not.toBeNull()
    expect(screen.getByText('Old title')).not.toBeNull()

    // Same id set, new field values: what a successful edit or star looks like.
    m.items = [
      {
        ...base,
        id: 'p1',
        title: 'New title',
        status: 'needsAction',
        parent_id: null,
        starred: true,
        due: '2026-11-20',
      },
    ]
    rerender(<Harness />)

    expect(screen.queryByText('Old title')).toBeNull()
    expect(screen.getByText('New title')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Unstar "New title"' })).not.toBeNull()
    expect(screen.getByText('Nov 20')).not.toBeNull()
    expect(container.querySelector('[data-task-id="p1"]')).toBe(before)
  })

  it('keeps the drag order of rows while showing their current data', () => {
    m.items = [
      { ...base, id: 'p1', title: 'First', status: 'needsAction', parent_id: null, position: 1 },
      { ...base, id: 'p2', title: 'Second', status: 'needsAction', parent_id: null, position: 2 },
    ]
    const { container, rerender } = render(<Harness />)
    expect(
      [...container.querySelectorAll('[data-task-id]')].map((li) => li.dataset.taskId),
    ).toEqual(['p1', 'p2'])

    m.items = [
      {
        ...base,
        id: 'p1',
        title: 'First renamed',
        status: 'needsAction',
        parent_id: null,
        position: 1,
      },
      { ...base, id: 'p2', title: 'Second', status: 'needsAction', parent_id: null, position: 2 },
    ]
    rerender(<Harness />)
    expect(screen.getByText('First renamed')).not.toBeNull()
    expect(
      [...container.querySelectorAll('[data-task-id]')].map((li) => li.dataset.taskId),
    ).toEqual(['p1', 'p2'])
  })

  it('shows a load error with Try again instead of the empty copy', () => {
    m.error = true
    render(<Harness />)
    expect(screen.getByRole('alert').textContent).toBe("Couldn't load tasks for this list.")
    expect(screen.queryByText('No tasks yet. Add one above.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(m.refetch).toHaveBeenCalledTimes(1)
  })

  it('confirms before deleting a task that has subtasks, and cancels by default', () => {
    m.items = [
      { ...base, id: 'p1', title: 'Parent', status: 'needsAction', parent_id: null },
      { ...base, id: 'c1', title: 'Child', status: 'needsAction', parent_id: 'p1', position: 2 },
    ]
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Parent"' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('Delete "Parent" and its 1 subtask?')
    expect(m.del.mutate).not.toHaveBeenCalled()
    // Cancel is the default (focused on open), so Enter keeps the task.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(m.del.mutate).toHaveBeenCalledWith('p1')
  })

  it('asks before deleting a task that has notes', () => {
    m.items = [
      {
        ...base,
        id: 'p1',
        title: 'Passport',
        status: 'needsAction',
        parent_id: null,
        notes_encrypted: 'enc',
      },
    ]
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Passport"' }))
    expect(screen.getByRole('alertdialog').textContent).toContain('Its notes will be deleted too.')
    expect(m.del.mutate).not.toHaveBeenCalled()
  })

  it('deletes a plain task immediately', () => {
    m.items = [{ ...base, id: 'p1', title: 'Water plants', status: 'needsAction', parent_id: null }]
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete "Water plants"' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(m.del.mutate).toHaveBeenCalledWith('p1')
  })
})
