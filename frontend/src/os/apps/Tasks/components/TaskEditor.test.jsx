import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TaskEditor from './TaskEditor'

describe('TaskEditor', () => {
  it('saves date, clock, and selected timezone as an offset-aware timed task', () => {
    const onSave = vi.fn()
    render(<TaskEditor initial={null} onSave={onSave} onCancel={() => {}} />)

    fireEvent.change(screen.getByLabelText('Task title'), {
      target: { value: 'Morning review' },
    })
    fireEvent.change(screen.getByLabelText('Due date'), {
      target: { value: '2026-06-16' },
    })
    fireEvent.change(screen.getByLabelText('Due time'), {
      target: { value: '09:00' },
    })
    fireEvent.change(screen.getByLabelText('Due time zone'), {
      target: { value: 'UTC' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Morning review',
        due: '2026-06-16',
        due_at: '2026-06-16T09:00:00+00:00',
        due_timezone: 'UTC',
        all_day: false,
      }),
    )
  })
})
