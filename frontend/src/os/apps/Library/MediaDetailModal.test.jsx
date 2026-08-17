import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MediaDetailModal from './MediaDetailModal'

const item = {
  id: 'book-1',
  type: 'book',
  title: 'Dune',
  creator: 'Frank Herbert',
  status: 'Reading',
}

describe('MediaDetailModal keyboard layers', () => {
  it('Escape closes only the topmost delete confirmation', async () => {
    const onClose = vi.fn()
    render(
      <MediaDetailModal item={item} onClose={onClose} onUpdate={() => {}} onDelete={() => {}} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete Entry' })).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { name: 'Delete Entry' })).toBeNull()
    })
    expect(screen.getByRole('dialog', { name: 'Dune' })).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
  })
})
