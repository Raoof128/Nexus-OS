import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import NotificationToast from '../NotificationToast'
import { useNotificationStore } from '../../stores/notificationStore'

function toast(id, type, title) {
  return { id, title, message: '', type, timestamp: Date.now(), read: false, toastDismissed: false }
}

describe('NotificationToast', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] })
  })

  it('keeps one polite live region for the whole stack', () => {
    render(<NotificationToast />)
    const region = screen.getByRole('region', { name: 'Notifications' })
    expect(region.getAttribute('aria-live')).toBe('polite')
  })

  it('draws each toast as a Win7 balloon tip', () => {
    useNotificationStore.setState({ notifications: [toast('a', 'info', 'Saved')] })
    render(<NotificationToast />)
    const balloon = screen.getByRole('tooltip')
    expect(balloon.textContent).toContain('Saved')
    expect(balloon.classList.contains('is-top')).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('wraps only error toasts in an assertive alert', () => {
    useNotificationStore.setState({ notifications: [toast('e', 'error', 'Upload failed')] })
    render(<NotificationToast />)
    expect(screen.getByRole('alert').textContent).toContain('Upload failed')
  })
})
