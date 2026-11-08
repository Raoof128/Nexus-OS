import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ComposeModal from './ComposeModal'

vi.mock('../../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}))

const ACCOUNTS = [{ id: 'acc-1', provider: 'google', email: 'me@example.com' }]

function renderCompose(props = {}) {
  const onClose = vi.fn()
  const utils = render(
    <ComposeModal isOpen onClose={onClose} accounts={ACCOUNTS} onSend={vi.fn()} {...props} />,
  )
  return { ...utils, onClose }
}

const dialog = () => screen.getByRole('dialog')

describe('ComposeModal discard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes straight away when nothing has been typed', () => {
    const { onClose } = renderCompose()
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Do you want to discard this message?')).toBeNull()
  })

  it('asks before discarding typed content on Escape', () => {
    const { onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Quarterly plan' } })
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.getByText('Do you want to discard this message?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancel keeps the message open and its content', () => {
    const { onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'Draft text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email body').value).toBe('Draft text')
  })

  it('confirming the prompt discards and closes', () => {
    const { onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'Draft text' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    // The prompt's own Discard is the second Discard button in the document.
    const discardButtons = screen.getAllByRole('button', { name: 'Discard' })
    fireEvent.click(discardButtons[discardButtons.length - 1])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a reply pre-filled with To and Subject does not count as unsaved', () => {
    const { onClose } = renderCompose({
      replyTo: {
        type: 'reply',
        email: { id: 'm1', from_address: 'boss@example.com', subject: 'Budget' },
      },
    })
    expect(screen.getByLabelText('Subject').value).toBe('Re: Budget')
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Do you want to discard this message?')).toBeNull()
  })

  it('the caption close button also asks first', () => {
    const { onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'a@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByText('Do you want to discard this message?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clears the Cc field when the window is reopened', () => {
    const { rerender, onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('Cc'), { target: { value: 'old@example.com' } })
    rerender(<ComposeModal isOpen={false} onClose={onClose} accounts={ACCOUNTS} onSend={vi.fn()} />)
    rerender(<ComposeModal isOpen onClose={onClose} accounts={ACCOUNTS} onSend={vi.fn()} />)
    expect(screen.getByLabelText('Cc').value).toBe('')
  })

  it('keeps typed text when the parent passes a new accounts array with the same sender', () => {
    const { rerender, onClose } = renderCompose()
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Keep me' } })
    rerender(
      <ComposeModal
        isOpen
        onClose={onClose}
        accounts={ACCOUNTS.map((a) => ({ ...a }))}
        onSend={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Subject').value).toBe('Keep me')
  })

  it('keeps typed text when accounts is still loading (no accounts prop)', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ComposeModal isOpen onClose={onClose} onSend={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Loading draft' } })
    rerender(<ComposeModal isOpen onClose={onClose} onSend={vi.fn()} />)
    expect(screen.getByLabelText('Subject').value).toBe('Loading draft')
  })
})

describe('ComposeModal AI draft', () => {
  it('sends only the backend contract: email_id and instruction', async () => {
    const onAiDraft = vi.fn().mockResolvedValue({ draft: 'Thanks, will do.' })
    renderCompose({
      onAiDraft,
      replyTo: {
        type: 'reply',
        email: { id: 'm1', from_address: 'boss@example.com', subject: 'Budget' },
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI draft' }))
    expect(onAiDraft).toHaveBeenCalledWith({ email_id: 'm1', instruction: '' })
    expect(await screen.findByDisplayValue('Thanks, will do.')).toBeTruthy()
  })
})
