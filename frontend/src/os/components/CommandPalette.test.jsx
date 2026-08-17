import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import CommandPalette from './CommandPalette'

describe('CommandPalette shortcut ownership', () => {
  it('does not open after a focused app consumes Cmd/Ctrl+K', () => {
    render(<CommandPalette />)
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()

    act(() => window.dispatchEvent(event))

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull()
  })
})
