import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MenuPanel from '../MenuPanel'

const row = (text) => {
  const found = Array.from(document.querySelectorAll('[data-menu-item]')).find(
    (el) => el.textContent === text,
  )
  if (!found) throw new Error(`no menu item "${text}"`)
  return found
}
const focused = () => document.activeElement

function setup() {
  const onOpen = vi.fn()
  const onShowIcons = vi.fn()
  const onDismiss = vi.fn()
  const list = [
    { id: 'open', label: '&Open', onSelect: onOpen },
    { type: 'separator' },
    { id: 'skip', label: 'Disabled', disabled: true, onSelect: vi.fn() },
    {
      id: 'view',
      label: '&View',
      items: [
        { id: 'view.icons', label: 'Show desktop &icons', checked: true, onSelect: onShowIcons },
        { id: 'view.off', label: '&Off', radio: true, checked: false, onSelect: vi.fn() },
      ],
    },
    { id: 'end', label: 'Last item', onSelect: vi.fn() },
  ]
  render(<MenuPanel label="Test menu" items={list} onDismiss={onDismiss} />)
  return { onOpen, onShowIcons, onDismiss }
}

describe('MenuPanel', () => {
  it('renders as a menu and focuses the first enabled item on open', () => {
    setup()
    expect(screen.getByRole('menu', { name: 'Test menu' })).toBeTruthy()
    expect(focused()).toBe(row('Open'))
  })

  it('underlines the mnemonic letter and leaves the rest of the label intact', () => {
    setup()
    expect(row('Open').querySelector('.nx-accel').textContent).toBe('O')
    expect(row('Open').textContent).toBe('Open')
  })

  it('marks disabled items and skips them with the arrow keys', () => {
    setup()
    expect(row('Disabled').getAttribute('aria-disabled')).toBe('true')
    fireEvent.keyDown(row('Open'), { key: 'ArrowDown' })
    expect(focused()).toBe(row('View'))
  })

  it('wraps with ArrowUp and jumps with Home and End', () => {
    setup()
    fireEvent.keyDown(row('Open'), { key: 'ArrowUp' })
    expect(focused()).toBe(row('Last item'))
    fireEvent.keyDown(row('Last item'), { key: 'Home' })
    expect(focused()).toBe(row('Open'))
    fireEvent.keyDown(row('Open'), { key: 'End' })
    expect(focused()).toBe(row('Last item'))
  })

  it('runs an item on Enter and then dismisses with select', () => {
    const { onOpen, onDismiss } = setup()
    fireEvent.keyDown(row('Open'), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledWith('select')
  })

  it('activates a single matching access key', () => {
    const { onOpen, onDismiss } = setup()
    fireEvent.keyDown(row('Last item'), { key: 'o' })
    expect(onOpen).toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalledWith('select')
  })

  it('dismisses on Escape and on Tab so focus cannot leave an open menu', () => {
    const { onDismiss } = setup()
    fireEvent.keyDown(row('Open'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenLastCalledWith('escape')
    fireEvent.keyDown(row('Open'), { key: 'Tab' })
    expect(onDismiss).toHaveBeenLastCalledWith('tab')
  })

  it('opens a submenu with ArrowRight, focuses its first item and closes it with ArrowLeft', () => {
    const { onDismiss } = setup()
    const view = row('View')
    expect(view.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.keyDown(view, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'View' })).toBeTruthy()
    const icons = row('Show desktop icons')
    expect(icons.getAttribute('role')).toBe('menuitemcheckbox')
    expect(icons.getAttribute('aria-checked')).toBe('true')
    expect(row('Off').getAttribute('role')).toBe('menuitemradio')
    expect(focused()).toBe(icons)
    fireEvent.keyDown(icons, { key: 'ArrowLeft' })
    expect(screen.queryByRole('menu', { name: 'View' })).toBeNull()
    expect(focused()).toBe(view)
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('Escape inside a submenu closes only the submenu', () => {
    const { onDismiss } = setup()
    fireEvent.keyDown(row('View'), { key: 'ArrowRight' })
    fireEvent.keyDown(row('Show desktop icons'), { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'View' })).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('does not run a disabled item when clicked', () => {
    const { onDismiss } = setup()
    fireEvent.click(row('Disabled'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
