import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecurrencePicker from './RecurrencePicker'

// Stateful host so the picker sees the value updates it emits.
function Host({ initial = null, onChange = () => {} }) {
  const [value, setValue] = useState(initial)
  return (
    <RecurrencePicker
      value={value}
      onChange={(next) => {
        onChange(next)
        setValue(next)
      }}
    />
  )
}

describe('RecurrencePicker', () => {
  it('shows the custom RRULE field only in custom mode', () => {
    render(<Host />)
    expect(screen.queryByRole('textbox', { name: 'Custom recurrence rule (RRULE)' })).toBeNull()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } })
    expect(screen.getByRole('textbox', { name: 'Custom recurrence rule (RRULE)' })).not.toBeNull()
  })

  it('keeps the custom field mounted when it is cleared', () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } })
    const field = screen.getByRole('textbox', { name: 'Custom recurrence rule (RRULE)' })
    field.focus()
    fireEvent.change(field, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith(null)
    // Still the same, focused field: the picker did not fall back to "Does not repeat".
    const after = screen.getByRole('textbox', { name: 'Custom recurrence rule (RRULE)' })
    expect(after).toBe(field)
    expect(document.activeElement).toBe(field)
    expect(screen.getByRole('combobox').value).toBe('custom')
  })

  it('leaves custom mode when a preset is chosen', () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'daily' } })
    expect(onChange).toHaveBeenLastCalledWith('FREQ=DAILY')
    expect(screen.queryByRole('textbox', { name: 'Custom recurrence rule (RRULE)' })).toBeNull()
  })

  it('shows an existing custom rule in custom mode and labels it', () => {
    render(<Host initial="FREQ=WEEKLY;BYDAY=MO,WE,FR" />)
    expect(screen.getByRole('combobox').value).toBe('custom')
    expect(screen.getByRole('textbox', { name: 'Custom recurrence rule (RRULE)' }).value).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    )
  })

  it('gives the repeat select a stable id tied to its label', () => {
    render(<Host />)
    const select = screen.getByRole('combobox')
    expect(select.id).not.toBe('')
    expect(document.querySelector(`label[for="${select.id}"]`).textContent).toBe('Repeat')
  })
})
