import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EmailApp from './EmailApp'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/apiClient', () => ({ apiFetch }))
vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))

const EMAILS = [
  {
    id: 'e1',
    account_id: 'a1',
    folder: 'inbox',
    from_name: 'Sydney Library',
    from_address: 'notices@library.example',
    subject: 'Your reservation is ready',
    snippet: 'The book you reserved is waiting.',
    provider_date: new Date().toISOString(),
    is_read: false,
    is_starred: true,
    has_attachments: false,
  },
  {
    id: 'e2',
    account_id: 'a1',
    folder: 'inbox',
    from_name: 'Example Pty Ltd',
    from_address: 'careers@example.test',
    subject: 'Interview availability',
    snippet: 'Thanks for applying.',
    provider_date: new Date().toISOString(),
    is_read: true,
    is_starred: false,
    has_attachments: true,
  },
]

// Answers the same way the API does: the search term filters the folder.
function matchesSearch(email, term) {
  return `${email.from_name} ${email.subject}`.toLowerCase().includes(term.toLowerCase())
}

function messagesPage(path) {
  const params = new URL(path, 'http://api.local').searchParams
  const term = params.get('search')
  const items = term ? EMAILS.filter((email) => matchesSearch(email, term)) : EMAILS
  return { items, next_cursor: null }
}

function installApi({ messages = messagesPage } = {}) {
  apiFetch.mockImplementation(async (path) => {
    if (path === '/api/email/accounts') return []
    if (path.startsWith('/api/email/messages')) return messages(path)
    if (path.endsWith('/html')) return { html: `<p>HTML ${path}</p>` }
    if (path.endsWith('/star')) return { ...EMAILS[1], is_starred: true }
    return {}
  })
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <EmailApp />
    </QueryClientProvider>,
  )
}

const searchBox = () => screen.getByRole('searchbox', { name: 'Search emails' })
const messageRequests = () =>
  apiFetch.mock.calls.map(([path]) => path).filter((path) => path.startsWith('/api/email/messages'))

describe('EmailApp search', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    installApi()
  })

  it('sends the typed term to the messages API after typing pauses', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Your reservation is ready/ })

    fireEvent.change(searchBox(), { target: { value: 'Sydney' } })

    await waitFor(() =>
      expect(messageRequests().some((path) => path.includes('search=Sydney'))).toBe(true),
    )
    // One request for the pause, not one per keystroke.
    expect(messageRequests().filter((path) => path.includes('search='))).toHaveLength(1)
  })

  it('shows the matching messages instead of the no-match copy', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Your reservation is ready/ })

    fireEvent.change(searchBox(), { target: { value: 'Sydney' } })

    // The folder list already has the match, so wait for the non-match to leave.
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /Interview availability/ })).toBeNull(),
    )
    expect(await screen.findByRole('option', { name: /Your reservation is ready/ })).toBeTruthy()
    expect(screen.queryByText('No messages match your search.')).toBeNull()
  })

  it('says no messages match when the search finds nothing', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Your reservation is ready/ })

    fireEvent.change(searchBox(), { target: { value: 'zzz-nothing' } })

    expect(await screen.findByText('No messages match your search.')).toBeTruthy()
  })

  it('opens a search result in the reader', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Your reservation is ready/ })

    fireEvent.change(searchBox(), { target: { value: 'Sydney' } })
    fireEvent.click(await screen.findByRole('option', { name: /Your reservation is ready/ }))

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/email/e1/html'))
    expect(await screen.findByTitle('Email body')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Your reservation is ready')
  })

  it('clearing the search returns to the folder list straight away', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Interview availability/ })
    fireEvent.change(searchBox(), { target: { value: 'Sydney' } })
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /Interview availability/ })).toBeNull(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(await screen.findByRole('option', { name: /Interview availability/ })).toBeTruthy()
    expect(searchBox().value).toBe('')
  })
})

describe('EmailApp error handling', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('shows the load error with Try again, not the inbox-empty copy', async () => {
    installApi({
      messages: () => {
        throw new Error('Mail provider timeout')
      },
    })
    renderApp()

    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert.textContent).toContain('Mail provider timeout')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.queryByText('Your inbox is empty.')).toBeNull()
  })

  it('reports a failed star instead of leaving the rejection unhandled', async () => {
    installApi()
    apiFetch.mockImplementation(async (path) => {
      if (path.endsWith('/star')) throw new Error('Provider busy')
      if (path === '/api/email/accounts') return []
      if (path.startsWith('/api/email/messages')) return messagesPage(path)
      return {}
    })
    renderApp()
    await screen.findByRole('option', { name: /Interview availability/ })

    fireEvent.click(document.querySelector('button[aria-label="Star"]'))

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't update the star. Provider busy",
    )
  })
})

describe('EmailApp mobile folder overlay', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    installApi()
  })

  it('closes on Escape and returns focus to the folder menu button', async () => {
    renderApp()
    await screen.findByRole('option', { name: /Interview availability/ })

    const menuButton = screen.getByRole('button', { name: 'Open folder menu' })
    act(() => menuButton.focus())
    // The desktop column also renders the folder list, so count the overlay as the extra one.
    const folderNavs = () => screen.queryAllByRole('navigation', { name: 'Email folders' })
    const before = folderNavs().length
    fireEvent.click(menuButton)
    expect(folderNavs().length).toBe(before + 1)

    fireEvent.keyDown(document.activeElement, { key: 'Escape' })

    await waitFor(() => expect(folderNavs().length).toBe(before))
    expect(document.activeElement).toBe(menuButton)
  })
})
