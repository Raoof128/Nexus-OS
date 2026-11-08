import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import MediaDetailModal from './MediaDetailModal'

const item = {
  id: 'a',
  type: 'book',
  title: 'Neuromancer',
  creator: 'William Gibson',
  genre: 'Sci-fi',
  status: 'Reading',
  rating: 4,
  takeaway: null,
  sub_info: null,
}

describe('MediaDetailModal footer', () => {
  it('has a Close button that calls onClose', () => {
    const onClose = vi.fn()
    render(
      <MediaDetailModal
        item={item}
        onClose={onClose}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Close', { selector: 'button' }))
    expect(onClose).toHaveBeenCalled()
  })
})
