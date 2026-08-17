import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CyberCard from './CyberCard'

const item = {
  id: 'book-1',
  type: 'book',
  title: 'Dune',
  creator: 'Frank Herbert',
  status: 'Reading',
  genre: 'Science fiction',
}

describe('CyberCard accessibility', () => {
  it('opens details from a real keyboard-accessible button without activating actions', () => {
    const onSelect = vi.fn()
    const onUpdate = vi.fn()
    render(<CyberCard item={item} onSelect={onSelect} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open Dune details' }))

    expect(onSelect).toHaveBeenCalledWith(item)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
