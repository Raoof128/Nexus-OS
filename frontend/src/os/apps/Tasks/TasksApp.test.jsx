import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import TasksApp from './TasksApp'

const mocks = vi.hoisted(() => ({ refetch: vi.fn() }))

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))

vi.mock('./hooks/useTasks', () => ({
  useTaskLists: () => ({
    data: [],
    isLoading: false,
    error: new Error('Task lists unavailable'),
    refetch: mocks.refetch,
  }),
  useTaskMutations: () => ({
    createList: { mutate: vi.fn() },
    deleteList: { mutate: vi.fn() },
    renameList: { mutate: vi.fn() },
  }),
}))

describe('TasksApp query state', () => {
  it('surfaces list loading failures with a retry action', () => {
    render(<TasksApp />)

    expect(screen.getByRole('alert').textContent).toContain('Task lists unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})
