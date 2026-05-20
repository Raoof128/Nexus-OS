import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_SUPABASE_URL', 'https://example.com')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
vi.stubEnv('VITE_API_URL', 'https://api.example.com')
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
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })
  })

  it('renders the login panel when signed out', () => {
    render(<App />)
    expect(screen.getByText(/system login/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /authenticate/i })).toBeTruthy()
  })

  it('shows loading spinner when auth is loading', () => {
    useAuth.mockReturnValue({ session: null, loading: true, signIn: vi.fn(), signOut: vi.fn() })
    render(<App />)
    expect(screen.getByText(/loading session/i)).toBeTruthy()
    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
  })

  it('renders the desktop OS shell when authenticated', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      addMedia: vi.fn(),
      updateMedia: vi.fn(),
      deleteMedia: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('desktop')).toBeTruthy()

    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      addMedia: vi.fn(),
      updateMedia: vi.fn(),
      deleteMedia: vi.fn(),
    })
  })

  it('renders the desktop OS shell when authenticated with items', () => {
    useAuth.mockReturnValue({
      session: { user: { id: 'u1', email: 'test@nexus.net' } },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [
        {
          id: '1',
          title: 'Neuromancer',
          creator: 'Gibson',
          status: 'Finished',
          type: 'book',
          genre: 'Cyberpunk',
          rating: 5,
        },
      ],
      loading: false,
      error: null,
      addMedia: vi.fn(),
      updateMedia: vi.fn(),
      deleteMedia: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('desktop')).toBeTruthy()

    useAuth.mockReturnValue({
      session: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn(),
    })
    useMedia.mockReturnValue({
      items: [],
      loading: false,
      error: null,
      addMedia: vi.fn(),
      updateMedia: vi.fn(),
      deleteMedia: vi.fn(),
    })
  })

  it('renders mobile brand header on small screens', () => {
    window.innerWidth = 500
    render(<App />)
    // The mobile brand header lives inside a div with the lg:hidden class
    const mobileWrapper = document.querySelector('[class*="lg:hidden"]')
    expect(mobileWrapper).toBeTruthy()
    expect(mobileWrapper.textContent).toMatch(/nexus\s*os/i)
  })

  it('hides mobile brand header on large screens via lg:hidden', () => {
    window.innerWidth = 1200
    render(<App />)
    // The container is in the DOM with lg:hidden (Tailwind hides it at lg+)
    const mobileWrapper = document.querySelector('[class*="lg:hidden"]')
    expect(mobileWrapper).toBeTruthy()
    expect(mobileWrapper.className).toContain('lg:hidden')
  })
})
