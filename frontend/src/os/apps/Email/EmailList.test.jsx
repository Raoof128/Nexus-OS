import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import EmailList from './EmailList'

const makeEmail = (id, overrides = {}) => ({
  id,
  from_name: `Sender ${id}`,
  from_address: `s${id}@example.com`,
  subject: `Subject ${id}`,
  snippet: `Snippet ${id}`,
  provider_date: '2026-11-01T10:00:00Z',
  is_read: true,
  is_starred: false,
  has_attachments: false,
  provider: 'google',
  ...overrides,
})

const EMAILS = [makeEmail('a'), makeEmail('b'), makeEmail('c')]

function renderList(props = {}) {
  const handlers = {
    onSelectEmail: vi.fn(),
    onToggleStar: vi.fn(),
  }
  const utils = render(
    <EmailList emails={EMAILS} selectedEmailId={null} {...handlers} {...props} />,
  )
  return { ...utils, ...handlers }
}

const options = () => screen.getAllByRole('option')

describe('EmailList keyboard model', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes a single Tab stop when nothing is selected (first message)', () => {
    renderList()
    const tabStops = options().filter((el) => el.tabIndex === 0)
    expect(tabStops).toHaveLength(1)
    expect(tabStops[0]).toBe(options()[0])
  })

  it('makes the selected message the only Tab stop', () => {
    renderList({ selectedEmailId: 'b' })
    const tabStops = options().filter((el) => el.tabIndex === 0)
    expect(tabStops).toHaveLength(1)
    expect(tabStops[0]).toBe(options()[1])
  })

  it('ArrowDown and ArrowUp move focus and selection between messages', () => {
    const { onSelectEmail } = renderList({ selectedEmailId: 'a' })
    options()[0].focus()

    fireEvent.keyDown(options()[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options()[1])
    expect(onSelectEmail).toHaveBeenLastCalledWith(EMAILS[1])

    fireEvent.keyDown(options()[1], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(options()[0])
    expect(onSelectEmail).toHaveBeenLastCalledWith(EMAILS[0])
  })

  it('stops at the ends of the list rather than wrapping', () => {
    const { onSelectEmail } = renderList({ selectedEmailId: 'c' })
    options()[2].focus()
    fireEvent.keyDown(options()[2], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(options()[2])
    expect(onSelectEmail).not.toHaveBeenCalled()
  })

  it('Home and End jump to the first and last message', () => {
    const { onSelectEmail } = renderList({ selectedEmailId: 'b' })
    options()[1].focus()
    fireEvent.keyDown(options()[1], { key: 'End' })
    expect(document.activeElement).toBe(options()[2])
    expect(onSelectEmail).toHaveBeenLastCalledWith(EMAILS[2])
    fireEvent.keyDown(options()[2], { key: 'Home' })
    expect(document.activeElement).toBe(options()[0])
    expect(onSelectEmail).toHaveBeenLastCalledWith(EMAILS[0])
  })

  it('Enter and Space still open the focused message', () => {
    const { onSelectEmail } = renderList()
    fireEvent.keyDown(options()[0], { key: 'Enter' })
    fireEvent.keyDown(options()[1], { key: ' ' })
    expect(onSelectEmail).toHaveBeenNthCalledWith(1, EMAILS[0])
    expect(onSelectEmail).toHaveBeenNthCalledWith(2, EMAILS[1])
  })

  it('S toggles the star of the focused message', () => {
    const { onToggleStar } = renderList()
    fireEvent.keyDown(options()[1], { key: 's' })
    expect(onToggleStar).toHaveBeenLastCalledWith({ emailId: 'b', isStarred: true })
  })
})

describe('EmailList star control', () => {
  it('keeps the star button out of the option', () => {
    renderList()
    const option = options()[0]
    const star = document.querySelector('button[aria-label="Star"]')
    expect(option.contains(star)).toBe(false)
    expect(star.tabIndex).toBe(-1)
    expect(star.getAttribute('aria-hidden')).toBe('true')
  })

  it('still toggles the star with the mouse without selecting the message', () => {
    const { onToggleStar, onSelectEmail } = renderList()
    fireEvent.click(document.querySelector('button[aria-label="Star"]'))
    expect(onToggleStar).toHaveBeenCalledWith({ emailId: 'a', isStarred: true })
    expect(onSelectEmail).not.toHaveBeenCalled()
  })

  it('names the option with its state so assistive tech hears it', () => {
    renderList({
      emails: [makeEmail('x', { is_read: false, is_starred: true, subject: 'Invoice' })],
    })
    const name = options()[0].getAttribute('aria-label')
    expect(name).toContain('Unread')
    expect(name).toContain('Starred')
    expect(name).toContain('Invoice')
    expect(options()[0].getAttribute('aria-keyshortcuts')).toBe('S')
  })

  it('shows the provider as a Windows 7 badge with the provider name', () => {
    renderList({ showProviderBadge: true })
    const badge = within(options()[0]).getByText('Gmail')
    expect(badge.className).toContain('w7-badge')
    expect(badge.className).toContain('text-w7-title')
  })
})
