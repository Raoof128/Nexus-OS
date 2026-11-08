import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('makes Cancel the default (focus + .default) for destructive confirms', () => {
    render(<ConfirmDialog open onConfirm={() => {}} onCancel={() => {}} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.className).toContain('default')
    expect(screen.getByRole('button', { name: 'Delete' }).className).not.toContain('default')
    expect(document.activeElement).toBe(cancel)
  })

  it('lets a caller keep the confirm button as the default explicitly', () => {
    render(
      <ConfirmDialog
        open
        defaultAction="confirm"
        confirmLabel="Save"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }))
  })

  it('defaults to the confirm button for non-destructive prompts', () => {
    render(
      <ConfirmDialog
        open
        variant="info"
        confirmLabel="OK"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'OK' }).className).toContain('default')
  })

  it('ignores an Escape event dispatched before it opened, but honours a later one', () => {
    // In a real browser React flushes the open effect while the Escape that
    // opened the dialog (e.g. Compose's "Discard?") is still dispatching, so
    // that same event reaches document. It carries a timeStamp from before
    // the dialog opened; the guard must ignore it.
    const onCancel = vi.fn()
    render(<ConfirmDialog open onConfirm={() => {}} onCancel={onCancel} />)

    const stale = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(stale, 'timeStamp', { value: performance.now() - 1000 })
    document.dispatchEvent(stale)
    expect(onCancel).not.toHaveBeenCalled()

    const fresh = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    Object.defineProperty(fresh, 'timeStamp', { value: performance.now() + 1 })
    document.dispatchEvent(fresh)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('does not let a backdrop click bubble to the component that opened it', () => {
    const onHostClick = vi.fn()
    const onCancel = vi.fn()
    render(
      <div onClick={onHostClick}>
        <ConfirmDialog open onConfirm={() => {}} onCancel={onCancel} />
      </div>,
    )
    const backdrop = screen.getByRole('alertdialog').parentElement
    fireEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onHostClick).not.toHaveBeenCalled()
  })
})
