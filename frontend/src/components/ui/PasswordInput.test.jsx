import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createRef } from 'react'
import PasswordInput from './PasswordInput'

describe('PasswordInput', () => {
  it('hides the value by default and toggles it with the reveal button', () => {
    render(<PasswordInput id="pw" value="secret" onChange={() => {}} />)
    const input = document.getElementById('pw')
    expect(input.getAttribute('type')).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle.getAttribute('type')).toBe('button')
    fireEvent.click(toggle)
    expect(input.getAttribute('type')).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
  })

  it('forwards the ref to the input so callers can focus it', () => {
    const ref = createRef()
    render(<PasswordInput ref={ref} value="" onChange={() => {}} />)
    expect(ref.current.tagName).toBe('INPUT')
  })

  it('cannot be switched to another input type by spread props', () => {
    render(<PasswordInput id="pw" type="text" value="" onChange={vi.fn()} />)
    expect(document.getElementById('pw').getAttribute('type')).toBe('password')
  })
})
