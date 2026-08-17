import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import LockScreen from './LockScreen'

describe('LockScreen focus', () => {
  it('moves focus to the lock dialog when it opens', () => {
    render(<LockScreen onUnlock={() => {}} />)

    expect(screen.getByRole('dialog', { name: /Lock screen/i })).toBe(document.activeElement)
  })
})
