import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TaskListView from './TaskListView'

const mocks = vi.hoisted(() => ({
  query: null,
  refetch: vi.fn(),
}))

vi.mock('../hooks/useTasks', () => ({
  useTaskItems: () => mocks.query,
  useTaskMutations: () => ({
    createTask: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
    updateTask: { mutate: vi.fn(), mutateAsync: vi.fn() },
    moveTask: { mutate: vi.fn() },
    deleteTask: { mutate: vi.fn() },
  }),
}))

vi.mock('../hooks/useTaskReminders', () => ({ useTaskReminders: () => {} }))

describe('TaskListView semantics', () => {
  beforeEach(() => {
    mocks.refetch.mockReset()
    mocks.query = {
      data: [
        {
          id: 'task-1',
          title: 'Review audit',
          status: 'needsAction',
          parent_id: null,
          position: 1,
          starred: false,
        },
      ],
      isLoading: false,
      error: null,
      refetch: mocks.refetch,
    }
  })

  it('renders task list items as direct children of the list', () => {
    const rootRef = { current: document.createElement('div') }
    const { container } = render(
      <TaskListView
        listId="list-1"
        listName="Audit"
        sortMode="myorder"
        onSortModeChange={() => {}}
        starredActive={false}
        rootRef={rootRef}
      />,
    )

    const list = container.querySelector('ul')
    expect(list?.children).toHaveLength(1)
    expect(list?.firstElementChild?.tagName).toBe('LI')
  })

  it('surfaces task loading failures with a retry action', () => {
    mocks.query = {
      data: [],
      isLoading: false,
      error: new Error('Tasks unavailable'),
      refetch: mocks.refetch,
    }
    const rootRef = { current: document.createElement('div') }
    render(
      <TaskListView
        listId="list-1"
        listName="Audit"
        sortMode="myorder"
        onSortModeChange={() => {}}
        starredActive={false}
        rootRef={rootRef}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Tasks unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
