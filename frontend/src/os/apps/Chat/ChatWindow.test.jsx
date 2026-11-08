import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatWindow from './ChatWindow'

const sendMessage = vi.fn()

vi.mock('../../../hooks/useChat', () => ({
  useChatMessages: () => ({
    messages: [
      { id: '1', role: 'user', content: 'Hello there', created_at: '2026-11-01T10:00:00Z' },
      { id: '2', role: 'assistant', content: 'Hi', created_at: '2026-11-01T10:00:05Z' },
    ],
    loading: false,
    sending: false,
    sendMessage,
    error: null,
  }),
}))

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
