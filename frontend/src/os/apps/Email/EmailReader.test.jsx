import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/apiClient', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../../../lib/apiClient'
import EmailReader from './EmailReader'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const EMAIL_A = {
  id: 'email-a',
  subject: 'Message A',
  from_address: 'a@example.com',
}

const EMAIL_B = {
  id: 'email-b',
  subject: 'Message B',
  from_address: 'b@example.com',
}

describe('EmailReader iframe policy', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('blocks remote resources and broadens only images after explicit opt-in', async () => {
    apiFetch.mockResolvedValue({
      html: '<style>@import url(https://tracker.invalid/style.css)</style><p>Hello</p>',
    })
    render(<EmailReader email={EMAIL_A} />)
    await waitFor(() => expect(screen.getByTitle('Email body')).toBeTruthy())

    const blocked = screen.getByTitle('Email body').getAttribute('srcdoc')
    expect(blocked).toContain("default-src 'none'")
    expect(blocked).toContain('img-src data:')
    expect(blocked).toContain("style-src 'unsafe-inline'")
    expect(blocked).toContain("font-src 'none'")
    expect(blocked).toContain("connect-src 'none'")
    expect(blocked).toContain("frame-src 'none'")
    expect(blocked).toContain("object-src 'none'")
    expect(blocked).toContain("base-uri 'none'")
    expect(blocked).toContain("form-action 'none'")

    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    const allowed = screen.getByTitle('Email body').getAttribute('srcdoc')
    expect(allowed.replace('img-src https: http: data: blob:', 'img-src data:')).toBe(blocked)
  })
})

describe('EmailReader request isolation', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('ignores a stale HTML response after a different email is selected', async () => {
    const requestA = deferred()
    const requestB = deferred()
    apiFetch.mockImplementation((path) =>
      path.includes(EMAIL_A.id) ? requestA.promise : requestB.promise,
    )

    const { rerender } = render(<EmailReader email={EMAIL_A} />)
    rerender(<EmailReader email={EMAIL_B} />)

    await act(async () => {
      requestB.resolve({ html: '<p>Body B</p>' })
      await requestB.promise
    })

    await waitFor(() => expect(screen.getByTitle('Email body')).toBeTruthy())
    expect(screen.getByTitle('Email body').getAttribute('srcdoc')).toContain('Body B')

    await act(async () => {
      requestA.resolve({ html: '<p>Body A</p>' })
      await requestA.promise
    })

    expect(screen.getByTitle('Email body').getAttribute('srcdoc')).toContain('Body B')
    expect(screen.getByTitle('Email body').getAttribute('srcdoc')).not.toContain('Body A')
  })
})
