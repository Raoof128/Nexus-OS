import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContextMenu from '../ContextMenu'

const items = [
  { id: 'a', label: '&Alpha', onSelect: vi.fn() },
  { id: 'b', label: '&Beta', onSelect: vi.fn() },
]

describe('ContextMenu', () => {
  it('renders the named menu and focuses its first item', () => {
    render(<ContextMenu x={10} y={10} label="Test menu" items={items} onClose={vi.fn()} />)
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy()
    expect(document.activeElement.getAttribute('data-id')).toBe('a')
  })

  it('closes when the user presses outside it', () => {
    const onClose = vi.fn()
    render(<ContextMenu x={10} y={10} label="Test menu" items={items} onClose={onClose} />)
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close when pressing inside it', () => {
    const onClose = vi.fn()
    render(<ContextMenu x={10} y={10} label="Test menu" items={items} onClose={onClose} />)
    fireEvent.pointerDown(screen.getByRole('menu', { name: 'Test menu' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape and when an item runs', () => {
    const onClose = vi.fn()
    render(<ContextMenu x={10} y={10} label="Test menu" items={items} onClose={onClose} />)
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs the item and closes it when activated', () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(
      <ContextMenu
        x={10}
        y={10}
        label="Test menu"
        items={[{ id: 'go', label: '&Go', onSelect }]}
        onClose={onClose}
      />,
    )
    fireEvent.click(document.querySelector('[data-id="go"]'))
    expect(onSelect).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
