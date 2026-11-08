import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

  it('asks before an AI draft replaces text that was typed', () => {
    const onAiDraft = vi.fn().mockResolvedValue({ draft: 'Drafted.' })
    renderCompose({
      onAiDraft,
      replyTo: {
        type: 'reply',
        email: { id: 'm1', from_address: 'boss@example.com', subject: 'Budget' },
      },
    })
    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'My own words' } })
    fireEvent.click(screen.getByRole('button', { name: 'AI draft' }))

    expect(
      screen.getByText(
        'Replace your message with the AI draft? The text you have written will be lost.',
      ),
    ).toBeTruthy()
    expect(onAiDraft).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onAiDraft).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Email body').value).toBe('My own words')
  })

  it('replaces the body with the draft once the user confirms', async () => {
    const onAiDraft = vi.fn().mockResolvedValue({ draft: 'Drafted.' })
    renderCompose({
      onAiDraft,
      replyTo: {
        type: 'reply',
        email: { id: 'm1', from_address: 'boss@example.com', subject: 'Budget' },
      },
    })
    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'My own words' } })
    fireEvent.click(screen.getByRole('button', { name: 'AI draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))

    expect(onAiDraft).toHaveBeenCalledTimes(1)
    expect(await screen.findByDisplayValue('Drafted.')).toBeTruthy()
  })

  it('drafts straight away when the body is still empty', async () => {
    const onAiDraft = vi.fn().mockResolvedValue({ draft: 'Drafted.' })
    renderCompose({
      onAiDraft,
      replyTo: { type: 'reply', email: { id: 'm1', from_address: 'boss@example.com' } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI draft' }))
    expect(onAiDraft).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/Replace your message/)).toBeNull()
    expect(await screen.findByDisplayValue('Drafted.')).toBeTruthy()
  })
})

describe('ComposeModal send guards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Ctrl+Enter does not send while To or Subject is empty', () => {
    const onSend = vi.fn()
    renderCompose({ onSend })
    fireEvent.change(screen.getByLabelText('Email body'), { target: { value: 'Body only' } })
    fireEvent.keyDown(dialog(), { key: 'Enter', ctrlKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('Ctrl+Enter sends a complete message through the form', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined)
    const { onClose } = renderCompose({ onSend })
    fireEvent.change(screen.getByLabelText('To', { exact: true }), {
      target: { value: 'friend@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hi' } })
    fireEvent.keyDown(dialog(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend.mock.calls[0][0]).toMatchObject({ to: 'friend@example.com', subject: 'Hi' })
  })

  it('Ctrl+Enter does nothing while a send is in flight', () => {
    const onSend = vi.fn()
    renderCompose({ onSend, isSending: true })
    fireEvent.change(screen.getByLabelText('To', { exact: true }), {
      target: { value: 'friend@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hi' } })
    fireEvent.keyDown(dialog(), { key: 'Enter', ctrlKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('Escape and the close button do nothing while a send is in flight', () => {
    const { onClose } = renderCompose({ isSending: true })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Hi' } })
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByText('Do you want to discard this message?')).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' }).disabled).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a send error only as passed in (a fresh compose has none)', () => {
    renderCompose({ sendError: null })
    expect(screen.queryByText(/Message not sent/)).toBeNull()
  })

  it('shows the send failure while the window is open', () => {
    renderCompose({ sendError: 'SMTP relay refused' })
    expect(screen.getByRole('alert').textContent).toContain('Message not sent. SMTP relay refused')
  })
})
