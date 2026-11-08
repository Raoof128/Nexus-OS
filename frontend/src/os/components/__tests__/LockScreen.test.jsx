import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { forwardRef, Children, useEffect, useRef } from 'react'

const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition']
const strip = (props) =>
  Object.fromEntries(Object.entries(props).filter(([k]) => !MOTION_PROPS.includes(k)))

vi.mock('framer-motion', () => ({
  motion: {
    div: forwardRef(({ children, ...rest }, ref) => (
      <div ref={ref} {...strip(rest)}>
        {children}
      </div>
    )),
  },
  // Calls onExitComplete once the single child has been removed, like the real component.
  AnimatePresence: ({ children, onExitComplete }) => {
    const present = Children.toArray(children).length > 0
    const was = useRef(present)
    useEffect(() => {
      if (was.current && !present) onExitComplete?.()
      was.current = present
    }, [present, onExitComplete])
    return <>{children}</>
  },
}))

const authState = {
  session: { user: { email: 'runner@nexus.net', user_metadata: {} } },
  signOut: vi.fn(),
  verifyPassword: vi.fn(),
}
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => authState }))

import LockScreen from '../LockScreen'

function renderLock(onUnlock = vi.fn()) {
  render(<LockScreen onUnlock={onUnlock} />)
  return onUnlock
}

const passwordBox = () => screen.getByLabelText('Password', { selector: 'input' })

describe('LockScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.verifyPassword.mockResolvedValue(false)
  })

  it('is named Lock screen and shows the user name, a password box and Switch User', () => {
    renderLock()
    expect(screen.getByRole('dialog', { name: 'Lock screen' })).toBeTruthy()
    expect(screen.getByText('runner@nexus.net')).toBeTruthy()
    expect(passwordBox().getAttribute('type')).toBe('password')
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Switch User' })).toBeTruthy()
  })

  it('moves focus into the password box on mount', () => {
    renderLock()
    expect(document.activeElement).toBe(passwordBox())
  })

  it('does not unlock on a click, a key press or a mouse press', () => {
    const onUnlock = renderLock()
    fireEvent.click(document.body)
    fireEvent.keyDown(document, { key: 'a' })
    fireEvent.keyDown(document, { key: 'Shift' })
    fireEvent.mouseDown(document.body)
    expect(authState.verifyPassword).not.toHaveBeenCalled()
    expect(onUnlock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('unlocks only after verifyPassword resolves true', async () => {
    authState.verifyPassword.mockResolvedValue(true)
    const onUnlock = renderLock()
    fireEvent.change(passwordBox(), { target: { value: 'correct horse' } })
    fireEvent.submit(passwordBox().closest('form'))
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1))
    expect(authState.verifyPassword).toHaveBeenCalledWith('correct horse')
  })

  it('shows the Windows 7 message and clears the box when the password is wrong', async () => {
    const onUnlock = renderLock()
    fireEvent.change(passwordBox(), { target: { value: 'wrong' } })
    fireEvent.submit(passwordBox().closest('form'))
    expect(await screen.findByText('The password is incorrect. Try again.')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('The password is incorrect')
    expect(passwordBox().value).toBe('')
    expect(onUnlock).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(passwordBox())
  })

  it('shows the error message when verification fails for another reason', async () => {
    authState.verifyPassword.mockRejectedValue(new Error('Request timed out. Please try again.'))
    const onUnlock = renderLock()
    fireEvent.change(passwordBox(), { target: { value: 'pw' } })
    fireEvent.submit(passwordBox().closest('form'))
    expect(await screen.findByText('Request timed out. Please try again.')).toBeTruthy()
    expect(onUnlock).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the lock and wraps between the first and last controls', () => {
    renderLock()
    const switchUser = screen.getByRole('button', { name: 'Switch User' })
    switchUser.focus()
    fireEvent.keyDown(switchUser, { key: 'Tab' })
    expect(document.activeElement).toBe(passwordBox())
    fireEvent.keyDown(passwordBox(), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(switchUser)
  })

  it('Escape clears the password box', () => {
    renderLock()
    fireEvent.change(passwordBox(), { target: { value: 'typed' } })
    fireEvent.keyDown(passwordBox(), { key: 'Escape' })
    expect(passwordBox().value).toBe('')
  })

  it('Switch User logs off through signOut', () => {
    renderLock()
    fireEvent.click(screen.getByRole('button', { name: 'Switch User' }))
    expect(authState.signOut).toHaveBeenCalledTimes(1)
    expect(authState.verifyPassword).not.toHaveBeenCalled()
  })

  it('keeps the reveal control available for the password', () => {
    renderLock()
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(passwordBox().getAttribute('type')).toBe('text')
  })

  it('does not submit an empty password', () => {
    renderLock()
    act(() => {
      fireEvent.submit(passwordBox().closest('form'))
    })
    expect(authState.verifyPassword).not.toHaveBeenCalled()
  })
})
