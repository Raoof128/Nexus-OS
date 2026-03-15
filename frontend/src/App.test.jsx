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

vi.mock('./hooks/useBooks', () => ({
  useBooks: vi.fn(() => ({
    books: [],
    loading: false,
    error: null,
    addBook: vi.fn(),
    updateBook: vi.fn(),
    deleteBook: vi.fn(),
  })),
}))

vi.mock('./lib/apiClient', () => ({
  authFetch: vi.fn().mockResolvedValue({ ok: true }),
  apiFetch: vi.fn().mockResolvedValue([]),
  refreshSession: vi.fn().mockResolvedValue({}),
}))

const { useAuth } = await import('./hooks/useAuth')
const { useBooks } = await import('./hooks/useBooks')

describe('App', () => {
  it('renders the login panel with register and forgot links when signed out', () => {
    render(<App />)

    expect(screen.getByText(/system login/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /authenticate/i })).toBeTruthy()
    expect(screen.getByText(/create account/i)).toBeTruthy()
    expect(screen.getByText(/forgot password/i)).toBeTruthy()
  })

  it('shows loading spinner when auth is loading', () => {
    useAuth.mockReturnValue({
      session: null,
      loading: true,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    render(<App />)

    expect(screen.getByText(/loading session/i)).toBeTruthy()

    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
  })

  it('renders the kanban board when authenticated', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    useBooks.mockReturnValue({
      books: [
        { id: '1', title: 'Neuromancer', author: 'Gibson', status: 'Finished', genre: 'Cyberpunk', rating: 5 },
      ],
      loading: false,
      error: null,
      addBook: vi.fn(),
      updateBook: vi.fn(),
      deleteBook: vi.fn(),
    })

    render(<App />)

    expect(screen.getByText('Neuromancer')).toBeTruthy()
    expect(screen.getByText('// Finished')).toBeTruthy()

    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
    useBooks.mockReturnValue({
      books: [],
      loading: false,
      error: null,
      addBook: vi.fn(),
      updateBook: vi.fn(),
      deleteBook: vi.fn(),
    })
  })

  it('displays error state when API fails', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })

    useBooks.mockReturnValue({
      books: [],
      loading: false,
      error: 'Connection refused',
      addBook: vi.fn(),
      updateBook: vi.fn(),
      deleteBook: vi.fn(),
    })

    render(<App />)

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/connection refused/i)).toBeTruthy()

    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
    useBooks.mockReturnValue({
      books: [],
      loading: false,
      error: null,
      addBook: vi.fn(),
      updateBook: vi.fn(),
      deleteBook: vi.fn(),
    })
  })
})
