import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import QuickAddBar from './QuickAddBar'

describe('QuickAddBar', () => {
  it('retains the draft and reports an error when creation fails', async () => {
    const onAdd = vi.fn().mockRejectedValue(new Error('Task creation failed'))
    render(<QuickAddBar onAdd={onAdd} disabled={false} />)

    fireEvent.change(screen.getByLabelText('Add a task'), {
      target: { value: 'Review audit tomorrow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Task creation failed')
    expect(screen.getByLabelText('Add a task').value).toBe('Review audit tomorrow')
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
  })
})
