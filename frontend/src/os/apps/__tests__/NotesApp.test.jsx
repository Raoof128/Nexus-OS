import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import NotesApp from '../NotesApp'
import { apiFetch } from '../../../lib/apiClient'

vi.mock('../../../lib/apiClient', () => ({
  apiFetch: vi.fn(),
}))

const notes = [
  {
    id: 'n1',
    title_encrypted: 'Pinned plan',
    content_encrypted: 'Ship #work notes',
    type: 'text',
    color: 'Mint',
    background: null,
    pinned: true,
    archived: false,
    position: 1,
    updated_at: '2026-06-20T00:00:00Z',
    labels: [{ id: 'l1', name: 'work' }],
  },
  {
    id: 'n2',
    title_encrypted: 'Groceries',
    content_encrypted: 'Milk and bread #home',
    type: 'list',
    color: 'Coral',
    background: 'Groceries',
    pinned: false,
    archived: false,
    position: 2,
    updated_at: '2026-06-20T00:00:00Z',
    labels: [{ id: 'l2', name: 'home' }],
  },
]

function renderNotes() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotesApp />
    </QueryClientProvider>,
  )
}

describe('NotesApp', () => {
  beforeEach(() => {
    apiFetch.mockReset()
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === '/notes/labels') {
        return Promise.resolve([
          { id: 'l1', name: 'work' },
          { id: 'l2', name: 'home' },
        ])
      }
      if (path.startsWith('/notes?')) return Promise.resolve(notes)
      if (path === '/notes' && options.method === 'POST') {
        return Promise.resolve({ id: 'created', ...options.body })
      }
      if (path === '/notes/n2/items') {
        return Promise.resolve([{ id: 'i1', text_encrypted: 'Milk', checked: false }])
      }
      if (path === '/notes/n1' && options.method === 'PATCH') {
        return Promise.resolve({ ...notes[0], ...options.body })
      }
      if (path === '/notes/n2' && options.method === 'PATCH') {
        return Promise.resolve({ ...notes[1], ...options.body })
      }
      return Promise.resolve({})
    })
  })

  it('renders notes from the API with pinned and label sections', async () => {
    renderNotes()

    expect(await screen.findByText('Pinned plan')).toBeDefined()
    expect(screen.getByText('Groceries')).toBeDefined()
    expect(screen.getAllByText('#work').length).toBeGreaterThan(0)
    expect(screen.getAllByText('#home').length).toBeGreaterThan(0)
  })

  it('filters notes client-side through search', async () => {
    renderNotes()
    await screen.findByText('Pinned plan')

    fireEvent.change(screen.getByLabelText('Search notes'), {
      target: { value: 'milk' },
    })

    expect(screen.getByText('Groceries')).toBeDefined()
    expect(screen.queryByText('Pinned plan')).toBeNull()
  })

  it('creates a text note through quick capture', async () => {
    renderNotes()
    await screen.findByText('Pinned plan')

    fireEvent.focus(screen.getByLabelText('New note title'))
    fireEvent.change(screen.getByLabelText('New note title'), {
      target: { value: 'New idea' },
    })
    fireEvent.change(screen.getByLabelText('New note body'), {
      target: { value: 'Body #ideas' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/notes', {
        method: 'POST',
        body: {
          title: 'New idea',
          content: 'Body #ideas',
          type: 'text',
          color: 'default',
          background: null,
          labels: [],
          reminder_at: null,
        },
      })
    })
  })

  it('retains a quick-capture draft when creation fails', async () => {
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === '/notes/labels') return Promise.resolve([])
      if (path.startsWith('/notes?')) return Promise.resolve(notes)
      if (path === '/notes' && options.method === 'POST') {
        return Promise.reject(new Error('Unable to create note'))
      }
      return Promise.resolve({})
    })
    renderNotes()
    await screen.findByText('Pinned plan')

    fireEvent.focus(screen.getByLabelText('New note title'))
    fireEvent.change(screen.getByLabelText('New note title'), {
      target: { value: 'Keep this idea' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to create note')
    expect(screen.getByLabelText('New note title').value).toBe('Keep this idea')
  })

  it('persists selected labels and reminders from quick capture', async () => {
    renderNotes()
    await screen.findByText('Pinned plan')

    fireEvent.focus(screen.getByLabelText('New note title'))
    fireEvent.change(screen.getByLabelText('New note title'), {
      target: { value: 'Reminder note' },
    })
    const capture = screen.getByLabelText('New note title').closest('form')
    fireEvent.click(within(capture).getByText('#work'))
    fireEvent.change(screen.getByLabelText('New note reminder'), {
      target: { value: '2026-06-21T09:30' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      const createCall = apiFetch.mock.calls.find(
        ([path, options]) => path === '/notes' && options?.method === 'POST',
      )
      expect(createCall[1].body.labels).toEqual(['work'])
      expect(createCall[1].body.reminder_at).toMatch(/^2026-06-20T|^2026-06-21T/)
    })
  })

  it('applies bulk color and labels to selected notes', async () => {
    renderNotes()
    await screen.findByText('Pinned plan')

    fireEvent.click(screen.getByLabelText('Select note "Pinned plan"'))
    fireEvent.click(screen.getAllByLabelText('Use Coral color')[0])

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/notes/n1', {
        method: 'PATCH',
        body: { color: 'Coral' },
      })
    })
  })

  it('adds rich text markdown and saves reminders in the editor', async () => {
    renderNotes()
    const card = await screen.findByText('Pinned plan')

    fireEvent.click(card)
    const body = screen.getByLabelText('Note body')
    fireEvent.change(body, { target: { value: 'Format me' } })
    body.setSelectionRange(0, 6)
    fireEvent.click(screen.getByLabelText('Bold'))
    fireEvent.change(screen.getByLabelText('Reminder'), {
      target: { value: '2026-06-21T09:30' },
    })
    fireEvent.click(screen.getByText('Save note'))

    await waitFor(() => {
      const updateCall = apiFetch.mock.calls.find(
        ([path, options]) => path === '/notes/n1' && options?.method === 'PATCH',
      )
      expect(updateCall[1].body.content).toContain('**Format**')
      expect(updateCall[1].body.reminder_at).toBeTruthy()
    })
  })

  it('keeps the editor and draft open when updating fails', async () => {
    apiFetch.mockImplementation((path, options = {}) => {
      if (path === '/notes/labels') return Promise.resolve([])
      if (path.startsWith('/notes?')) return Promise.resolve(notes)
      if (path === '/notes/n1' && options.method === 'PATCH') {
        return Promise.reject(new Error('Unable to update note'))
      }
      return Promise.resolve({})
    })
    renderNotes()
    fireEvent.click(await screen.findByText('Pinned plan'))
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'Unsaved title' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to update note')
    expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeDefined()
    expect(screen.getByLabelText('Note title').value).toBe('Unsaved title')
  })

  it('opens checklist notes and loads checklist items', async () => {
    renderNotes()
    const card = await screen.findByText('Groceries')

    fireEvent.click(card)

    const dialog = screen.getByRole('dialog', { name: 'Edit note' })
    expect(within(dialog).getByDisplayValue('Groceries')).toBeDefined()
    expect(await screen.findByDisplayValue('Milk')).toBeDefined()
    expect(apiFetch).toHaveBeenCalledWith('/notes/n2/items')
  })

  it('restores focus to the originating note after the editor closes', async () => {
    renderNotes()
    const openButton = await screen.findByRole('button', { name: /Pinned plan/i })
    act(() => openButton.focus())
    await act(async () => {
      fireEvent.click(openButton)
    })

    expect(screen.getByRole('dialog', { name: 'Edit note' })).toBeDefined()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    })

    await waitFor(() => expect(document.activeElement).toBe(openButton))
  })

  it('provides mobile access to Archive and Trash views', async () => {
    renderNotes()
    await screen.findByText('Pinned plan')
    const mobileViews = screen.getByRole('navigation', { name: 'Mobile notes views' })

    fireEvent.click(within(mobileViews).getByRole('button', { name: 'Archive' }))
    expect(screen.getByRole('heading', { name: 'Archive' })).toBeDefined()

    fireEvent.click(within(mobileViews).getByRole('button', { name: 'Trash' }))
    expect(screen.getByRole('heading', { name: 'Trash' })).toBeDefined()
  })

  it('supports checklist bulk controls', async () => {
    apiFetch.mockImplementation((path) => {
      if (path === '/notes/labels') return Promise.resolve([])
      if (path.startsWith('/notes?')) return Promise.resolve(notes)
      if (path === '/notes/n2/items') {
        return Promise.resolve([
          { id: 'i1', text_encrypted: 'Milk', checked: true, position: 1 },
          { id: 'i2', text_encrypted: 'Bread', checked: false, position: 2 },
        ])
      }
      return Promise.resolve({})
    })

    renderNotes()
    fireEvent.click(await screen.findByText('Groceries'))
    await screen.findByDisplayValue('Milk')
    fireEvent.click(screen.getByText('Uncheck all'))

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/notes/items/i1', {
        method: 'PATCH',
        body: { checked: false },
      })
    })
  })
})
