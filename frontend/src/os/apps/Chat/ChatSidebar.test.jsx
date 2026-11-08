import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ChatSidebar from './ChatSidebar'

const sessions = [{ id: 's1', title: 'Reading list ideas', category: 'general' }]

function renderSidebar(props = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onDelete: vi.fn(),
    onRetry: vi.fn(),
  }
  render(
    <ChatSidebar
      sessions={sessions}
      activeSessionId={null}
      isCreating={false}
      loadError={null}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('ChatSidebar load errors', () => {
  it('shows a Retry error instead of the empty-conversation copy', () => {
    const { onRetry } = renderSidebar({ sessions: [], loadError: new Error('down') })
    expect(screen.queryByText(/No conversations yet/)).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load your conversations")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the empty copy only when the list truly is empty', () => {
    renderSidebar({ sessions: [] })
    expect(screen.getByText(/No conversations yet/)).toBeTruthy()
  })
})

describe('ChatSidebar create and delete failures', () => {
  it('keeps the title and the form open when creating fails', async () => {
    const { onCreate } = renderSidebar()
    onCreate.mockRejectedValueOnce(new Error('Could not create'))
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }))
    const title = screen.getByRole('textbox', { name: 'Conversation title' })
    fireEvent.change(title, { target: { value: 'Plans' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("Couldn't create"))
    expect(screen.getByRole('textbox', { name: 'Conversation title' }).value).toBe('Plans')
    expect(onCreate).toHaveBeenCalledWith({ title: 'Plans', category: 'general' })
  })

  it('reports a failed delete inline and keeps the session listed', async () => {
    const { onDelete } = renderSidebar()
    onDelete.mockRejectedValueOnce(new Error('Delete failed'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reading list ideas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("Couldn't delete"))
    expect(screen.getByRole('button', { name: 'Reading list ideas', exact: true })).toBeTruthy()
  })
})
