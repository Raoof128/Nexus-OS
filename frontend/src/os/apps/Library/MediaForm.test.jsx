import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MediaForm from './MediaForm'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'

describe('MediaForm command area', () => {
  it('puts the default action first and Cancel after it', () => {
    const onCancel = vi.fn()
    render(
      <MediaForm
        config={MEDIA_CONFIG.book}
        onSubmit={vi.fn()}
        submitLabel="Add Book"
        onCancel={onCancel}
        idPrefix="t"
      />,
    )
    const commandArea = screen.getByRole('button', { name: 'Add Book' }).parentElement
    const buttons = commandArea.querySelectorAll('button')
    expect(buttons[0].textContent).toBe('Add Book')
    expect(buttons[0].getAttribute('type')).toBe('submit')
    expect(buttons[1].textContent).toBe('Cancel')
    fireEvent.click(buttons[1])
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('omits Cancel when no onCancel handler is given', () => {
    render(
      <MediaForm config={MEDIA_CONFIG.book} onSubmit={vi.fn()} submitLabel="Save" idPrefix="t" />,
    )
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})
