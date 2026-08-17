import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import MediaVault from './MediaVault'

const item = {
  id: 'book-1',
  type: 'book',
  title: 'Dune',
  creator: 'Frank Herbert',
  status: 'Reading',
  genre: 'Science fiction',
}

describe('MediaVault accessibility', () => {
  it('opens a vault row through a real keyboard-accessible button', () => {
    const onSelect = vi.fn()
    const onUpdate = vi.fn()
    render(
      <MediaVault
        items={[item]}
        mediaType="book"
        filterStatus={null}
        onBack={() => {}}
        onSelect={onSelect}
        onUpdate={onUpdate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open Dune details' }))

    expect(onSelect).toHaveBeenCalledWith(item)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
