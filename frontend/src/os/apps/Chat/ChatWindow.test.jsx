import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatWindow from './ChatWindow'

const hook = vi.hoisted(() => ({ state: {}, refetch: vi.fn(), sendMessage: vi.fn() }))

vi.mock('../../../hooks/useChat', () => ({
  useChatMessages: () => ({
    messages: [
      { id: '1', role: 'user', content: 'Hello there', created_at: '2026-11-01T10:00:00Z' },
      { id: '2', role: 'assistant', content: 'Hi', created_at: '2026-11-01T10:00:05Z' },
    ],
    loading: false,
    sending: false,
    loadError: null,
    refetch: hook.refetch,
    sendMessage: hook.sendMessage,
    error: null,
    ...hook.state,
  }),
}))

const sendMessage = hook.sendMessage

beforeEach(() => {
  hook.state = {}
  sendMessage.mockReset()
  hook.refetch.mockReset()
})

describe('ChatWindow bubbles', () => {
  it('draws user bubbles with the Windows 7 selection tokens, not hex', () => {
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const bubble = screen.getByText('Hello there')
    expect(bubble.className).toContain('bg-w7-select')
    expect(bubble.className).toContain('border-w7-select-border')
    expect(bubble.className).not.toMatch(/#[0-9a-f]{3,6}/i)
  })

  it('draws assistant bubbles as Win7 cards', () => {
    render(<ChatWindow sessionId="s1" userId="u1" />)
    expect(screen.getByText('Hi').className).toContain('w7-card')
  })

  it('gives the typed text back when sending fails (the API stores nothing)', async () => {
    sendMessage.mockRejectedValueOnce(new Error('The AI assistant is unavailable'))
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const box = screen.getByLabelText('Chat message')
    fireEvent.change(box, { target: { value: 'What next?' } })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => expect(box.value).toBe('What next?'))
    expect(sendMessage).toHaveBeenCalledWith('What next?')
  })
})

describe('ChatWindow load errors', () => {
  it('shows an error with Retry instead of the empty-conversation copy', () => {
    hook.state = { messages: [], loadError: new Error('History unavailable') }
    render(<ChatWindow sessionId="s1" userId="u1" />)
    expect(screen.queryByText('Start the conversation')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load this conversation")
  })

  it('Retry refetches the history', () => {
    hook.state = { messages: [], loadError: new Error('History unavailable') }
    render(<ChatWindow sessionId="s1" userId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(hook.refetch).toHaveBeenCalledTimes(1)
  })
})

describe('ChatWindow composer while sending', () => {
  it('keeps the composer focusable and marks it busy instead of disabling it', () => {
    hook.state = { sending: true }
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const box = screen.getByLabelText('Chat message')
    expect(box.disabled).toBe(false)
    expect(box.readOnly).toBe(true)
    expect(box.getAttribute('aria-busy')).toBe('true')
  })

  it('keeps focus in the composer when Send is clicked', async () => {
    let finish
    sendMessage.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const box = screen.getByLabelText('Chat message')
    const send = screen.getByLabelText('Send message')
    fireEvent.change(box, { target: { value: 'Next?' } })
    send.focus()
    fireEvent.click(send)
    expect(document.activeElement).toBe(box)
    finish()
  })

  it('does not send while an IME composition is confirmed with Enter', () => {
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const box = screen.getByLabelText('Chat message')
    fireEvent.change(box, { target: { value: 'にほん' } })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('sends on a plain Enter', () => {
    render(<ChatWindow sessionId="s1" userId="u1" />)
    const box = screen.getByLabelText('Chat message')
    fireEvent.change(box, { target: { value: 'Hello' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(sendMessage).toHaveBeenCalledWith('Hello')
  })
})
