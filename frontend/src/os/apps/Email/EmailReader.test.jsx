import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import EmailReader from './EmailReader'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('../../../lib/apiClient', () => ({ apiFetch }))

const message = (id, overrides = {}) => ({
  id,
  subject: `Subject ${id}`,
  from_address: `${id}@example.com`,
  snippet: `Snippet ${id}`,
  is_read: true,
  ...overrides,
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderReader(email) {
  const handlers = { onReply: vi.fn(), onArchive: vi.fn(), onTrash: vi.fn(), onToggleRead: vi.fn() }
  const utils = render(<EmailReader email={email} {...handlers} />)
  const rerenderWith = (next) => utils.rerender(<EmailReader email={next} {...handlers} />)
  return { ...utils, rerenderWith }
}

const iframeSrcdoc = () => screen.getByTitle('Email body').getAttribute('srcdoc')

describe('EmailReader body loading', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('shows the HTML again when a message is reselected (not the snippet)', async () => {
    apiFetch.mockResolvedValue({ html: '<p>HTML BODY e1</p>' })
    const { rerenderWith } = renderReader(message('e1'))
    await screen.findByTitle('Email body')

    // Deselect (folder switch), then reselect the same message.
    rerenderWith(null)
    rerenderWith(message('e1'))

    expect(screen.queryByText('Snippet e1')).toBeNull()
    expect(iframeSrcdoc()).toContain('HTML BODY e1')
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
  })

  it('never shows an earlier message body under a newer header', async () => {
    const slow = deferred()
    const fast = deferred()
    apiFetch.mockImplementation((path) =>
      path === '/api/email/e1/html' ? slow.promise : fast.promise,
    )
    const { rerenderWith } = renderReader(message('e1', { subject: 'First' }))
    rerenderWith(message('e2', { subject: 'Second' }))

    await act(async () => {
      fast.resolve({ html: '<p>HTML BODY e2</p>' })
    })
    await act(async () => {
      slow.resolve({ html: '<p>HTML BODY e1</p>' })
    })

    // The header animates between messages, so wait for it to settle.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Second'),
    )
    expect(iframeSrcdoc()).toContain('HTML BODY e2')
    expect(iframeSrcdoc()).not.toContain('HTML BODY e1')
  })

  it('does not show a late error for an earlier message', async () => {
    const slow = deferred()
    apiFetch.mockImplementation((path) =>
      path === '/api/email/e1/html' ? slow.promise : Promise.resolve({ html: '<p>ok</p>' }),
    )
    const { rerenderWith } = renderReader(message('e1'))
    rerenderWith(message('e2'))
    await screen.findByTitle('Email body')

    await act(async () => {
      slow.reject(new Error('Provider timeout'))
    })

    expect(screen.queryByRole('alert')).toBeNull()
    expect(iframeSrcdoc()).toContain('ok')
  })

  it('loads the body with no allow-same-origin in the sandbox', async () => {
    apiFetch.mockResolvedValue({ html: '<p>Hello</p>' })
    renderReader(message('e1'))
    const frame = await screen.findByTitle('Email body')
    expect(frame.getAttribute('sandbox')).toBe('allow-popups')
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-same-origin/)
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-scripts/)
  })

  it('resets remote-image consent when another message is selected', async () => {
    apiFetch.mockResolvedValue({ html: '<img src="https://img.example/x.png">' })
    const { rerenderWith } = renderReader(message('e1'))
    await screen.findByTitle('Email body')
    fireEvent.click(screen.getByRole('button', { name: 'Show images' }))
    expect(screen.getByText('Remote images are shown.')).toBeTruthy()

    rerenderWith(message('e2'))
    await screen.findByTitle('Email body')
    expect(screen.getByText('Remote images are hidden to protect your privacy.')).toBeTruthy()
  })
})
