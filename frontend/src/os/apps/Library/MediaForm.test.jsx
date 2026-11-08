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

describe('MediaForm trimmed validation', () => {
  function renderForm(onSubmit) {
    const { container } = render(
      <MediaForm
        config={MEDIA_CONFIG.book}
        onSubmit={onSubmit}
        submitLabel="Add Book"
        idPrefix="v"
      />,
    )
    return container.querySelector('form')
  }

  it('does not submit a whitespace-only title and focuses the title field', () => {
    const onSubmit = vi.fn()
    const form = renderForm(onSubmit)
    fireEvent.change(document.getElementById('v-title'), { target: { value: '   ' } })
    fireEvent.change(document.getElementById('v-creator'), { target: { value: 'Ann' } })
    fireEvent.submit(form)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Enter a title.')
    expect(document.activeElement).toBe(document.getElementById('v-title'))
    expect(document.getElementById('v-title').getAttribute('aria-invalid')).toBe('true')
  })

  it('does not submit a whitespace-only creator and names the field by its role', () => {
    const onSubmit = vi.fn()
    const form = renderForm(onSubmit)
    fireEvent.change(document.getElementById('v-title'), { target: { value: 'Dune' } })
    fireEvent.change(document.getElementById('v-creator'), { target: { value: '  ' } })
    fireEvent.submit(form)

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('Enter the author.')
  })

  it('submits trimmed values', () => {
    const onSubmit = vi.fn()
    const form = renderForm(onSubmit)
    fireEvent.change(document.getElementById('v-title'), { target: { value: '  Dune  ' } })
    fireEvent.change(document.getElementById('v-creator'), { target: { value: ' Frank Herbert ' } })
    fireEvent.submit(form)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Dune', creator: 'Frank Herbert' })
  })
})
