import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LazyAICmdPalette from './LazyAICmdPalette'

describe('LazyAICmdPalette entry point', () => {
  it('keeps the accessible name', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    expect(screen.getByRole('button', { name: 'Ask AI (open command palette)' })).toBeTruthy()
  })

  it('floats by default and is a Win7 toolbar element, not a floating push button', () => {
    render(<LazyAICmdPalette mediaType="book" />)
    const button = screen.getByRole('button', { name: 'Ask AI (open command palette)' })
    expect(button.className).toContain('w7-toolbtn')
    expect(button.className).toContain('fixed')
    expect(button.className).not.toContain('w7-btn')
  })

  it('placement="inline" renders in normal flow for a host command bar', () => {
    render(<LazyAICmdPalette mediaType="book" placement="inline" />)
    const button = screen.getByRole('button', { name: 'Ask AI (open command palette)' })
    expect(button.className).toContain('w7-toolbtn')
    expect(button.className).not.toContain('fixed')
  })
})
