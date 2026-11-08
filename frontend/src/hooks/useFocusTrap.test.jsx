import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { useFocusTrap } from './useFocusTrap'

function Dialog({ withField = false }) {
  const ref = useFocusTrap(true)
  return (
    <div ref={ref} className="window">
      <div className="title-bar">
        <div className="title-bar-controls">
          <button type="button" aria-label="Close" />
        </div>
      </div>
      <div className="window-body">{withField && <input aria-label="Name" />}</div>
      <footer>
        <button type="button" className="default">
          OK
        </button>
        <button type="button">Cancel</button>
      </footer>
    </div>
  )
}

describe('useFocusTrap (Windows 7 dialog focus)', () => {
  it('message box: initial focus goes to the default button, not the caption close', () => {
    const { getByText } = render(<Dialog />)
    expect(document.activeElement).toBe(getByText('OK'))
  })

  it('form dialog: initial focus goes to the first text field', () => {
    const { getByLabelText } = render(<Dialog withField />)
    expect(document.activeElement).toBe(getByLabelText('Name'))
  })

  it('Tab cycles the command buttons and skips the caption buttons', () => {
    const { getByText } = render(<Dialog />)
    const cancel = getByText('Cancel')
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(document.activeElement).toBe(getByText('OK'))
    fireEvent.keyDown(getByText('OK'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancel)
  })
})
