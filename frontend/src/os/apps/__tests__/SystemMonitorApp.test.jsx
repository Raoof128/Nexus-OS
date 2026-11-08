import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    session: {
      user: { email: 'dev@example.com', id: 'user-123', app_metadata: { provider: 'google' } },
    },
  }),
}))

import SystemMonitorApp from '../SystemMonitorApp'
import { useWindowStore } from '../../stores/windowStore'

const WINDOWS = {
  sysmon: { windowId: 'sysmon', appId: 'sysmon', title: 'System Monitor', state: 'normal' },
  notes: { windowId: 'notes', appId: 'notes', title: 'Untitled note', state: 'normal' },
  media: { windowId: 'media', appId: 'media', title: 'Clips', state: 'minimized' },
}

function seedStore(overrides = {}) {
  useWindowStore.setState({
    windows: { ...WINDOWS },
    zStack: ['sysmon', 'notes', 'media'],
    activeWindowId: 'notes',
    ...overrides,
  })
}

// Mount inside act so the health check and sampler effects settle in the test.
async function renderApp() {
  await act(async () => {
    render(<SystemMonitorApp windowId="sysmon" />)
  })
}

function tab(name) {
  return screen.getByRole('tab', { name })
}

describe('SystemMonitorApp', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true }))
    // The shared ResizeObserver stub loses its methods after restoreAllMocks, so
    // give this file a plain no-op observer for the tab strip's overflow cue.
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    seedStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('tabs', () => {
    it('lists the six Windows 7 tabs in order', async () => {
      await renderApp()
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
        'Applications',
        'Processes',
        'Services',
        'Performance',
        'Networking',
        'Users',
      ])
    })

    it('selects Applications by default', async () => {
      await renderApp()
      expect(tab('Applications').getAttribute('aria-selected')).toBe('true')
      expect(screen.getByRole('tabpanel', { name: 'Applications' }).hidden).toBe(false)
    })

    it('points every tab at a panel that exists in the DOM', async () => {
      await renderApp()
      for (const t of screen.getAllByRole('tab')) {
        const panelId = t.getAttribute('aria-controls')
        expect(document.getElementById(panelId)).not.toBeNull()
        expect(document.getElementById(panelId).getAttribute('role')).toBe('tabpanel')
      }
    })

    it('hides inactive panels rather than removing them', async () => {
      await renderApp()
      const services = document.getElementById('sysmon-panel-services')
      expect(services).not.toBeNull()
      expect(services.hidden).toBe(true)
    })

    it('uses a roving tabindex so only the selected tab is in the Tab sequence', async () => {
      await renderApp()
      expect(tab('Applications').tabIndex).toBe(0)
      for (const name of ['Processes', 'Services', 'Performance', 'Networking', 'Users']) {
        expect(tab(name).tabIndex).toBe(-1)
      }
    })

    it('moves selection and focus with Left and Right arrows, wrapping at the ends', async () => {
      await renderApp()
      fireEvent.keyDown(tab('Applications'), { key: 'ArrowRight' })
      expect(tab('Processes').getAttribute('aria-selected')).toBe('true')
      expect(document.activeElement).toBe(tab('Processes'))

      fireEvent.keyDown(tab('Processes'), { key: 'ArrowLeft' })
      expect(tab('Applications').getAttribute('aria-selected')).toBe('true')

      fireEvent.keyDown(tab('Applications'), { key: 'ArrowLeft' })
      expect(tab('Users').getAttribute('aria-selected')).toBe('true')
      expect(document.activeElement).toBe(tab('Users'))

      fireEvent.keyDown(tab('Users'), { key: 'ArrowRight' })
      expect(tab('Applications').getAttribute('aria-selected')).toBe('true')
    })

    it('jumps to the first and last tab with Home and End', async () => {
      await renderApp()
      fireEvent.keyDown(tab('Applications'), { key: 'End' })
      expect(tab('Users').getAttribute('aria-selected')).toBe('true')
      fireEvent.keyDown(tab('Users'), { key: 'Home' })
      expect(tab('Applications').getAttribute('aria-selected')).toBe('true')
    })

    it('cycles tabs with Ctrl+Tab and Ctrl+Shift+Tab', async () => {
      await renderApp()
      fireEvent.keyDown(tab('Applications'), { key: 'Tab', ctrlKey: true })
      expect(tab('Processes').getAttribute('aria-selected')).toBe('true')
      expect(document.activeElement).toBe(tab('Processes'))

      fireEvent.keyDown(tab('Processes'), { key: 'Tab', ctrlKey: true, shiftKey: true })
      expect(tab('Applications').getAttribute('aria-selected')).toBe('true')

      fireEvent.keyDown(tab('Applications'), { key: 'Tab', ctrlKey: true, shiftKey: true })
      expect(tab('Users').getAttribute('aria-selected')).toBe('true')
    })

    it('activates a tab on click', async () => {
      await renderApp()
      fireEvent.click(tab('Networking'))
      expect(tab('Networking').getAttribute('aria-selected')).toBe('true')
      expect(document.getElementById('sysmon-panel-networking').hidden).toBe(false)
    })
  })

  describe('applications', () => {
    it('shows only Task and Status columns, with no internal app id', async () => {
      await renderApp()
      const table = screen.getByRole('grid', { name: 'Running applications' })
      const headers = within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent)
      expect(headers).toEqual(['Task', 'Status'])
      expect(screen.queryByText('sysmon')).toBeNull()
      expect(screen.queryByText('notes')).toBeNull()
    })

    it('disables Switch To and End Task until a row is selected', async () => {
      await renderApp()
      expect(screen.getByRole('button', { name: 'Switch To' }).disabled).toBe(true)
      expect(screen.getByRole('button', { name: 'End Task' }).disabled).toBe(true)
      expect(screen.getByRole('button', { name: 'New Task…' }).disabled).toBe(false)
    })

    it('selects a row on click and marks it with aria-selected', async () => {
      await renderApp()
      const row = screen.getByRole('row', { name: /Untitled note/ })
      fireEvent.click(row)
      expect(row.getAttribute('aria-selected')).toBe('true')
      expect(screen.getByRole('button', { name: 'Switch To' }).disabled).toBe(false)
    })

    it('Switch To brings the selected window to the front', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('row', { name: /Clips/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Switch To' }))
      expect(useWindowStore.getState().activeWindowId).toBe('media')
      expect(useWindowStore.getState().windows.media.state).toBe('normal')
    })

    it('End Task closes the selected window and keeps a neighbour selected', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('row', { name: /Untitled note/ }))
      fireEvent.click(screen.getByRole('button', { name: 'End Task' }))
      expect(useWindowStore.getState().windows.notes).toBeUndefined()
      expect(useWindowStore.getState().zStack).not.toContain('notes')
      const selectedRows = screen
        .getAllByRole('row')
        .filter((r) => r.getAttribute('aria-selected') === 'true')
      expect(selectedRows).toHaveLength(1)
      expect(selectedRows[0].textContent).toContain('Clips')
    })

    it('moves the selection with arrow keys and switches on Enter', async () => {
      await renderApp()
      const first = screen.getByRole('row', { name: /System Monitor/ })
      fireEvent.keyDown(first, { key: 'ArrowDown' })
      const second = screen.getByRole('row', { name: /Untitled note/ })
      expect(second.getAttribute('aria-selected')).toBe('true')
      expect(document.activeElement).toBe(second)

      fireEvent.keyDown(second, { key: 'Enter' })
      expect(useWindowStore.getState().activeWindowId).toBe('notes')
    })

    it('shows an empty state when no windows are open', async () => {
      seedStore({ windows: {}, zStack: [], activeWindowId: null })
      await renderApp()
      expect(screen.getByText('No windows are open.')).toBeDefined()
    })
  })

  describe('processes', () => {
    it('shows the app registry title in the Name column', async () => {
      await renderApp()
      fireEvent.click(tab('Processes'))
      const table = screen.getByRole('table', { name: 'Processes' })
      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((h) => h.textContent),
      ).toEqual(['Name', 'Window title', 'User name'])
      expect(within(table).getByRole('cell', { name: 'Notes' })).toBeDefined()
      expect(within(table).getByRole('cell', { name: 'Untitled note' })).toBeDefined()
      expect(within(table).getAllByRole('cell', { name: 'dev@example.com' })).toHaveLength(3)
    })

    it('shows how many windows are visible, which the old status bar used to show', async () => {
      await renderApp()
      fireEvent.click(tab('Processes'))
      const group = screen.getByRole('group', { name: 'Windows' })
      expect(within(group).getByText('2 of 3')).toBeDefined()
    })
  })

  describe('services', () => {
    it('reports the API as Running after a successful health check', async () => {
      await renderApp()
      fireEvent.click(tab('Services'))
      const table = screen.getByRole('table', { name: 'Services' })
      await waitFor(() => {
        const row = within(table).getByRole('row', { name: /Nexus API/ })
        expect(row.textContent).toContain('Running')
      })
    })

    it('reports the API as Stopped when the health check fails', async () => {
      globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')))
      await renderApp()
      fireEvent.click(tab('Services'))
      const table = screen.getByRole('table', { name: 'Services' })
      await waitFor(() => {
        const row = within(table).getByRole('row', { name: /Nexus API/ })
        expect(row.textContent).toContain('Stopped')
      })
    })

    it('lists only services the app really uses, with no Realtime row', async () => {
      await renderApp()
      fireEvent.click(tab('Services'))
      const table = screen.getByRole('table', { name: 'Services' })
      expect(within(table).queryByRole('row', { name: /Realtime/ })).toBeNull()
      expect(screen.queryByRole('group', { name: 'Realtime' })).toBeNull()
    })

    it('runs a health check when Check now is pressed', async () => {
      await renderApp()
      fireEvent.click(tab('Services'))
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
      const before = globalThis.fetch.mock.calls.length
      fireEvent.click(screen.getByRole('button', { name: 'Check now' }))
      await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before))
    })
  })

  describe('performance', () => {
    it('uses Windows memory terms and says browser memory is Chrome only', async () => {
      await renderApp()
      fireEvent.click(tab('Performance'))
      expect(screen.getByRole('group', { name: 'Physical memory' })).toBeDefined()
      expect(screen.getByRole('group', { name: 'Browser memory (Chrome only)' })).toBeDefined()
      expect(screen.getByRole('group', { name: 'Page CPU (est.)' })).toBeDefined()
    })

    it('does not claim a physical memory percentage the browser cannot report', async () => {
      await renderApp()
      fireEvent.click(tab('Performance'))
      const group = screen.getByRole('group', { name: 'Physical memory' })
      expect(within(group).getByText('Not reported by browsers')).toBeDefined()
    })
  })

  describe('networking', () => {
    it('reports the browser connection as Connected while online', async () => {
      await renderApp()
      fireEvent.click(tab('Networking'))
      const table = screen.getByRole('table', { name: 'Network connections' })
      expect(within(table).getByText('Connected')).toBeDefined()
    })
  })

  describe('users', () => {
    it('shows the signed-in account and sign-in provider', async () => {
      await renderApp()
      fireEvent.click(tab('Users'))
      const table = screen.getByRole('table', { name: 'Users' })
      expect(within(table).getByText('dev@example.com')).toBeDefined()
      expect(within(table).getByText('google')).toBeDefined()
      expect(within(table).getByText('Active')).toBeDefined()
    })
  })

  describe('menu bar', () => {
    it('has File, Options, View, Windows and Help menus', async () => {
      await renderApp()
      const bar = screen.getByRole('menubar', { name: 'Task Manager menu' })
      expect(
        within(bar)
          .getAllByRole('menuitem')
          .map((m) => m.textContent),
      ).toEqual(['File', 'Options', 'View', 'Windows', 'Help'])
    })

    it('opens a menu on click and closes it on Escape', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
      expect(screen.getByRole('menuitem', { name: 'New Task…' })).toBeDefined()
      expect(screen.getByRole('menuitem', { name: 'Exit' })).toBeDefined()
      fireEvent.keyDown(screen.getByRole('menuitem', { name: 'New Task…' }), { key: 'Escape' })
      expect(screen.queryByRole('menuitem', { name: 'Exit' })).toBeNull()
    })

    it('Exit closes this Task Manager window', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Exit' }))
      expect(useWindowStore.getState().windows.sysmon).toBeUndefined()
    })

    it('Windows menu brings a listed window to the front', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Windows' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Clips' }))
      expect(useWindowStore.getState().activeWindowId).toBe('media')
    })

    it('View > Refresh runs a health check', async () => {
      await renderApp()
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled())
      const before = globalThis.fetch.mock.calls.length
      fireEvent.click(screen.getByRole('menuitem', { name: 'View' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /Refresh/ }))
      await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before))
    })

    it('Options toggles automatic refresh as a checkable item', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Options' }))
      const item = screen.getByRole('menuitemcheckbox', { name: 'Refresh every 30 seconds' })
      expect(item.getAttribute('aria-checked')).toBe('true')
      fireEvent.click(item)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Options' }))
      expect(
        screen
          .getByRole('menuitemcheckbox', { name: 'Refresh every 30 seconds' })
          .getAttribute('aria-checked'),
      ).toBe('false')
    })

    it('opens with the keyboard and moves into the first item', async () => {
      await renderApp()
      const file = screen.getByRole('menuitem', { name: 'File' })
      file.focus()
      fireEvent.keyDown(file, { key: 'Enter' })
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New Task…' }))
    })

    it('Help shows the keyboard shortcuts note', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Keyboard shortcuts' }))
      expect(screen.getByRole('note').textContent).toContain('Ctrl+Tab')
    })

    it('Tab closes the open menu and keeps focus on the menu header', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
      const newTask = screen.getByRole('menuitem', { name: 'New Task…' })
      newTask.focus()
      fireEvent.keyDown(newTask, { key: 'Tab' })
      expect(screen.queryByRole('menuitem', { name: 'Exit' })).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'File' }))
    })

    it('clicking the menu padding does not close the menu', async () => {
      await renderApp()
      fireEvent.click(screen.getByRole('menuitem', { name: 'File' }))
      const separator = screen.getByRole('separator')
      fireEvent.click(separator)
      expect(screen.getByRole('menuitem', { name: 'Exit' })).toBeDefined()
    })
  })

  describe('status bar', () => {
    it('labels the CPU figure as a page estimate, never as system CPU', async () => {
      await renderApp()
      const bar = document.querySelector('.status-bar')
      expect(bar.textContent).toContain('Processes: 3')
      expect(bar.textContent).toContain('Page CPU (est.):')
      expect(bar.textContent).not.toContain('CPU Usage')
      expect(bar.textContent).toContain('JS heap:')
      expect(bar.textContent).not.toContain('API:')
    })
  })
})
