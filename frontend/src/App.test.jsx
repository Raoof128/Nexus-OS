import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    session: null,
    loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('./hooks/useBooks', () => ({
  useBooks: () => ({
    books: [],
    loading: false,
    error: null,
  }),
}))

describe('App', () => {
  it('renders an accessible login form when signed out', () => {
    render(<App />)

    expect(screen.getByLabelText(/identity \/\/ email/i)).toBeTruthy()
    expect(screen.getByLabelText(/passkey \/\/ secret/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /authenticate/i })).toBeTruthy()
  })
})
