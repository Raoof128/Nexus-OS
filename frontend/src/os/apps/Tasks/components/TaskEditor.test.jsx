import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskEditor from './TaskEditor'

describe('TaskEditor', () => {
  it('puts the default action before Cancel, in Windows OK | Cancel order', () => {
    render(<TaskEditor initial={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    const add = screen.getByRole('button', { name: 'Add task' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(add.className).toContain('default')
    // DOCUMENT_POSITION_FOLLOWING (4): cancel comes after add in the footer.
    expect(add.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('labels the header close control so it does not duplicate the Cancel button name', () => {
    render(<TaskEditor initial={null} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Close' })).not.toBeNull()
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1)
  })

  it('saves a trimmed title and cancels from the footer', () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<TaskEditor initial={null} onSave={onSave} onCancel={onCancel} />)
    const input = screen.getByRole('textbox', { name: 'Task title' })
    fireEvent.change(input, { target: { value: '  Buy milk  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Buy milk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
