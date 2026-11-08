import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

const signOut = vi.fn()

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: { user: { email: 'dev@example.com', id: 'user-123' } },
    signOut,
  }),
}))

vi.mock('../../../lib/opfsDrive', () => ({
  isOpfsSupported: () => false,
  estimateStorage: vi.fn(() => Promise.resolve({ usage: 0, quota: 0 })),
  requestPersistentStorage: () => Promise.resolve(false),
  clearAllBlobs: () => Promise.resolve(0),
  formatBytes: (n) => `${n} B`,
}))

import { estimateStorage } from '../../../lib/opfsDrive'
import SettingsApp from '../SettingsApp'
import { useSettingsStore, ACCENT_PRESETS } from '../../stores/settingsStore'

function openCategory(name) {
  const nav = screen.getByRole('navigation', { name: 'Control Panel categories' })
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(name) }))
}

describe('SettingsApp', () => {
  beforeEach(() => {
    localStorage.clear()
    signOut.mockClear()
    document.body.style.removeProperty('--w7-w-bg')
    document.body.style.removeProperty('--w7-glass-blur')
    delete document.body.dataset.transparency
    useSettingsStore.setState({
      accentColor: 'sky',
      wallpaper: 'aero',
      uiScale: 'default',
      wallpaperPosition: 'fill',
      colorIntensity: 100,
      transparencyEnabled: true,
    })
  })

  it('lists the Control Panel categories with sentence-case labels', () => {
    render(<SettingsApp />)
    const nav = screen.getByRole('navigation', { name: 'Control Panel categories' })
    const labels = within(nav)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(labels).toEqual([
      'Personalization',
      'Nexus Drive',
      'Notifications',
      'User accounts',
      'System',
    ])
  })

  it('opens Personalization first and shows its Win7 main instruction', () => {
    render(<SettingsApp />)
    expect(
      screen.getByRole('heading', { name: 'Change the visuals on your computer' }),
    ).toBeDefined()
  })

  describe('Window color', () => {
    it('offers Enable transparency and Color intensity', () => {
      render(<SettingsApp />)
      expect(screen.getByRole('checkbox', { name: 'Enable transparency' })).toBeDefined()
      const slider = screen.getByRole('slider', { name: 'Color intensity' })
      expect(slider.getAttribute('min')).toBe('0')
      expect(slider.getAttribute('max')).toBe('100')
    })

    it('changing Color intensity updates the store and the frame colour on body', () => {
      render(<SettingsApp />)
      fireEvent.change(screen.getByRole('slider', { name: 'Color intensity' }), {
        target: { value: '20' },
      })
      expect(useSettingsStore.getState().colorIntensity).toBe(20)
      expect(document.body.style.getPropertyValue('--w7-w-bg')).not.toBe(ACCENT_PRESETS.sky.frame)
    })

    it('turning transparency off makes the frame opaque', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('checkbox', { name: 'Enable transparency' }))
      expect(useSettingsStore.getState().transparencyEnabled).toBe(false)
      expect(document.body.dataset.transparency).toBe('off')
      expect(document.body.style.getPropertyValue('--w7-glass-blur')).toBe('0px')
    })

    it('picking a colour still applies straight away', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('button', { name: 'Violet' }))
      expect(useSettingsStore.getState().accentColor).toBe('violet')
    })
  })

  describe('Desktop background', () => {
    it('stages a picture until Save changes is pressed', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('button', { name: 'Wallpaper 3' }))
      expect(screen.getByRole('button', { name: 'Wallpaper 3' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
      expect(useSettingsStore.getState().wallpaper).toBe('aero')

      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(useSettingsStore.getState().wallpaper).toBe('w3')
    })

    it('Cancel throws the staged picture and position away', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('button', { name: 'Wallpaper 3' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Picture position' }), {
        target: { value: 'center' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.getByRole('button', { name: 'Aero' }).getAttribute('aria-pressed')).toBe('true')
      expect(screen.getByRole('combobox', { name: 'Picture position' }).value).toBe('fill')
      expect(useSettingsStore.getState().wallpaper).toBe('aero')
    })

    it('applies the picture position with the picture on Save changes', () => {
      render(<SettingsApp />)
      const select = screen.getByRole('combobox', { name: 'Picture position' })
      const options = within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
      expect(options).toEqual(['Fill', 'Fit', 'Stretch', 'Tile', 'Center'])

      fireEvent.change(select, { target: { value: 'tile' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(useSettingsStore.getState().wallpaperPosition).toBe('tile')
    })

    it('Save changes and Cancel are off until something is staged', () => {
      render(<SettingsApp />)
      expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
      expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
      fireEvent.click(screen.getByRole('button', { name: 'Wallpaper 2' }))
      expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(false)
    })

    it('follows the stored picture when it changes elsewhere', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('button', { name: 'Wallpaper 2' }))
      act(() => {
        useSettingsStore.setState({ wallpaper: 'w5' })
      })
      expect(screen.getByRole('button', { name: 'Wallpaper 5' }).getAttribute('aria-pressed')).toBe(
        'true',
      )
      expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
    })

    it('no longer shows the old Saved flash', () => {
      render(<SettingsApp />)
      fireEvent.click(screen.getByRole('button', { name: 'Wallpaper 2' }))
      expect(screen.queryByText('Saved')).toBeNull()
    })
  })

  it('Display size applies immediately', () => {
    render(<SettingsApp />)
    fireEvent.click(screen.getByRole('radio', { name: 'Larger' }))
    expect(useSettingsStore.getState().uiScale).toBe('large')
  })

  describe('User accounts', () => {
    it('Factory reset… carries an ellipsis and asks before it runs', () => {
      render(<SettingsApp />)
      openCategory('User accounts')
      const reset = screen.getByRole('button', { name: 'Factory reset…' })
      expect(reset).toBeDefined()
      fireEvent.click(reset)
      expect(
        screen.getByText(
          "This removes your settings, notes, files on Nexus Drive and window layout from this browser. Your account on the server is not changed. You can't undo this.",
        ),
      ).toBeDefined()
    })

    it('Factory reset… puts focus on Cancel, the safe default', () => {
      render(<SettingsApp />)
      openCategory('User accounts')
      fireEvent.click(screen.getByRole('button', { name: 'Factory reset…' }))
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
    })

    it('Factory reset… is separated from Sign out', () => {
      render(<SettingsApp />)
      openCategory('User accounts')
      const reset = screen.getByRole('button', { name: 'Factory reset…' })
      expect(reset.className).toContain('ml-auto')
    })

    it('Sign out still signs out', () => {
      render(<SettingsApp />)
      openCategory('User accounts')
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
      expect(signOut).toHaveBeenCalled()
    })
  })

  describe('Nexus Drive storage', () => {
    it('says it is measuring while the estimate is pending, not that it is unavailable', async () => {
      render(<SettingsApp />)
      openCategory('Nexus Drive')
      expect(screen.getByText('Measuring storage…')).toBeDefined()
      expect(screen.queryByText('Storage estimate unavailable.')).toBeNull()
      expect(await screen.findByRole('progressbar', { name: 'Storage used' })).toBeDefined()
      expect(screen.queryByText('Measuring storage…')).toBeNull()
    })

    it('reports unavailable only when the browser gives no estimate', async () => {
      estimateStorage.mockResolvedValueOnce(null)
      render(<SettingsApp />)
      openCategory('Nexus Drive')
      expect(await screen.findByText('Storage estimate unavailable.')).toBeDefined()
    })
  })
})
