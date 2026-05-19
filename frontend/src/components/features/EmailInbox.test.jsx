import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'

vi.mock('lucide-react', () => ({
  ArrowLeft: () => null,
  Menu: () => null,
  Search: () => null,
  Star: () => null,
  Paperclip: () => null,
  X: () => null,
  Send: () => null,
  Sparkles: () => null,
  Loader2: () => null,
  ChevronDown: () => null,
  Plus: () => null,
  Zap: () => null,
  Inbox: () => null,
  Eye: () => null,
  EyeOff: () => null,
  AlertTriangle: () => null,
}))

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () => {
        return ({ children, ...props }) => {
          // strip motion-specific props
          // eslint-disable-next-line no-unused-vars
          const {
            _initial,
            _animate,
            _exit,
            _transition,
            _variants,
            _layoutId,
            _layout,
            _whileHover,
            _whileTap,
            ...rest
          } = props
          return <div {...rest}>{children}</div>
        }
      },
    },
  ),
  AnimatePresence: ({ children }) => <>{children}</>,
  LayoutGroup: ({ children }) => <>{children}</>,
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' }, access_token: 'jwt' } }),
}))
vi.mock('../../hooks/useEmailAccounts', () => ({
  useEmailAccounts: () => ({
    accounts: [
      { id: 'acct-1', email_address: 'raoof@gmail.com', provider: 'google', status: 'connected' },
    ],
    loading: false,
    error: null,
  }),
}))
vi.mock('../../hooks/useEmails', () => ({
  useEmails: () => ({
    emails: [
      {
        id: 'msg-1',
        account_id: 'acct-1',
        from_name: 'Jane',
        from_address: 'jane@citadel.com',
        subject: 'Interview follow-up',
        snippet: 'Hi Raouf, thanks for...',
        is_read: false,
        is_starred: false,
        provider_date: '2026-04-10T09:00:00Z',
        to_addresses: [{ name: 'Raouf', email: 'raoof@gmail.com' }],
        folder: 'inbox',
      },
    ],
    loading: false,
    error: null,
    loadMore: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    refetch: vi.fn(),
  }),
}))
vi.mock('../../hooks/useEmailActions', () => ({
  useEmailActions: () => ({
    markRead: vi.fn(),
    toggleStar: vi.fn(),
    moveToFolder: vi.fn(),
    sendEmail: vi.fn(),
    replyEmail: vi.fn(),
    forwardEmail: vi.fn(),
    aiDraft: vi.fn(),
    aiSummarize: vi.fn(),
    isSending: false,
    sendError: null,
  }),
}))
vi.mock('./EmailReader', () => ({
  default: ({ email }) =>
    email ? (
      <div data-testid="email-reader">{email.subject}</div>
    ) : (
      <div data-testid="email-reader-empty">SELECT_SIGNAL</div>
    ),
}))
vi.mock('./ComposeModal', () => ({
  default: () => null,
}))
vi.mock('./FolderSidebar', () => ({
  default: ({ onSelectFolder }) => (
    <nav aria-label="Email folders">
      <button type="button" onClick={() => onSelectFolder?.('inbox')}>
        Inbox
      </button>
    </nav>
  ),
}))
vi.mock('./EmailList', () => ({
  default: ({ emails, onSelectEmail }) => (
    <ul role="list" aria-label="Email messages">
      {emails.map((e) => (
        <li key={e.id} onClick={() => onSelectEmail?.(e)}>
          {e.subject}
        </li>
      ))}
    </ul>
  ),
}))

import EmailInbox from './EmailInbox'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

describe('EmailInbox', () => {
  it('renders the three-column layout', () => {
    render(
      <QueryClientProvider client={qc}>
        <EmailInbox />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('navigation', { name: /email folders/i })).toBeTruthy()
    expect(screen.getByText('Interview follow-up')).toBeTruthy()
    expect(screen.getByText(/SELECT_SIGNAL/)).toBeTruthy()
  })
  it('shows compose button', () => {
    render(
      <QueryClientProvider client={qc}>
        <EmailInbox />
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: /compose/i })).toBeTruthy()
  })
})
