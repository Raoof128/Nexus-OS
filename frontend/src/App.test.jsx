import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    session: null,
    loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn(),
  })),
}))

vi.mock('./hooks/useMedia', () => ({
  useMedia: vi.fn(() => ({
    items: [],
    loading: false,
    error: null,
    addMedia: vi.fn(),
    updateMedia: vi.fn(),
    deleteMedia: vi.fn(),
  })),
}))

vi.mock('./lib/apiClient', () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true }),
  apiFetch: vi.fn().mockResolvedValue([]),
  refreshSession: vi.fn().mockResolvedValue({}),
}))

const { useAuth } = await import('./hooks/useAuth')
const { useMedia } = await import('./hooks/useMedia')

describe('App', () => {
  it('renders the login panel when signed out', () => {
    render(<App />)
    expect(screen.getByText(/system login/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /authenticate/i })).toBeTruthy()
  })

  it('shows loading spinner when auth is loading', () => {
    useAuth.mockReturnValue({ session: null, loading: true, signIn: vi.fn(), signOut: vi.fn() })
    render(<App />)
    expect(screen.getByText(/loading session/i)).toBeTruthy()
    useAuth.mockReturnValue({ session: null, loading: false, signIn: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn() })
  })

  it('renders media tabs and kanban when authenticated', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false, signIn: vi.fn(), signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [{ id: '1', title: 'Neuromancer', creator: 'Gibson', status: 'Finished', type: 'book', genre: 'Cyberpunk', rating: 5 }],
      loading: false, error: null, addMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn(),
    })

    render(<App />)
    expect(screen.getByText('Neuromancer')).toBeTruthy()
    expect(screen.getByText('Books')).toBeTruthy()
    expect(screen.getByText('Movies')).toBeTruthy()
    expect(screen.getByText('Anime')).toBeTruthy()

    useAuth.mockReturnValue({ session: null, loading: false, signIn: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn() })
    useMedia.mockReturnValue({ items: [], loading: false, error: null, addMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn() })
  })

  it('displays error state when API fails', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false, signIn: vi.fn(), signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [], loading: false, error: 'Connection refused',
      addMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn(),
    })

    render(<App />)
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/connection refused/i)).toBeTruthy()

    useAuth.mockReturnValue({ session: null, loading: false, signIn: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn() })
    useMedia.mockReturnValue({ items: [], loading: false, error: null, addMedia: vi.fn(), updateMedia: vi.fn(), deleteMedia: vi.fn() })
  })
})
