import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ChatApp from './ChatApp'

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'u1' } } }),
}))

vi.mock('../../../hooks/useChat', () => ({
  useChatSessions: () => ({
    sessions: [{ id: 's1', title: 'Reading list ideas', category: 'general' }],
    loading: false,
    loadError: null,
    refetch: vi.fn(),
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    isCreating: false,
  }),
  useChatMessages: () => ({
    messages: [{ id: '1', role: 'user', content: 'Hello', created_at: '2026-11-01T10:00:00Z' }],
    loading: false,
    loadError: null,
    refetch: vi.fn(),
    sending: false,
    sendMessage: vi.fn(),
    error: null,
  }),
}))

describe('ChatApp layout', () => {
  it('mounts one message log and one composer after a conversation is open', () => {
    render(<ChatApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Reading list ideas', exact: true }))
    expect(screen.getAllByRole('log', { name: 'Chat messages' })).toHaveLength(1)
    expect(screen.getAllByRole('textbox', { name: 'Chat message' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'New conversation' })).toHaveLength(1)
  })

  it('offers one way back to the conversation list from the thread', () => {
    render(<ChatApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Reading list ideas', exact: true }))
    expect(screen.getAllByRole('button', { name: /Conversations/ })).toHaveLength(1)
  })
})
