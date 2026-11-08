import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ListSidebar from './ListSidebar'

const LISTS = [
  { id: 'a', name: 'Home', position: 1 },
  { id: 'b', name: 'Work', position: 2 },
]

function setup(props = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onToggleStarred: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
  }
  const parentKeyDown = vi.fn()
  const utils = render(
    // The wrapper stands in for TasksApp's root, which listens for Escape.
    <div onKeyDown={parentKeyDown}>
      <ListSidebar lists={LISTS} activeListId="a" starredActive={false} {...handlers} {...props} />
    </div>,
  )
  return { ...utils, ...handlers, parentKeyDown }
}

describe('ListSidebar new-list form', () => {
  it('Escape in the New list input closes the form, returns focus to the New list button and does not bubble', () => {
    const { parentKeyDown } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    const input = screen.getByRole('textbox', { name: 'New list name' })
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: 'New list name' })).toBeNull()
    const newList = screen.getByRole('button', { name: 'New list' })
    expect(document.activeElement).toBe(newList)
    expect(newList.getAttribute('aria-expanded')).toBe('false')
    expect(parentKeyDown).not.toHaveBeenCalled()
  })

  it('Cancel returns focus to the New list button', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new list' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New list' }))
  })

  it('submitting creates the trimmed list and returns focus to the New list button', () => {
    const { onCreate } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    const input = screen.getByRole('textbox', { name: 'New list name' })
    fireEvent.change(input, { target: { value: '  Errands  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }))

    expect(onCreate).toHaveBeenCalledWith('Errands')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New list' }))
  })
})

describe('ListSidebar close control', () => {
  it('renders no close button unless the host provides onClose', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Close task lists' })).toBeNull()
  })

  it('calls onClose from the header close button, which is hidden at desktop width', () => {
    const onClose = vi.fn()
    setup({ onClose })
    const close = screen.getByRole('button', { name: 'Close task lists' })
    expect(close.className).toContain('@md:hidden')
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
