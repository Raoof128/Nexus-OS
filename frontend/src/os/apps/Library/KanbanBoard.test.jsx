import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KanbanBoard from './KanbanBoard'

describe('KanbanBoard add commands', () => {
  it('labels the empty-column add command with an ellipsis', () => {
    render(<KanbanBoard items={[]} mediaType="book" onAddRequest={() => {}} onUpdate={() => {}} />)
    expect(screen.getAllByRole('button', { name: 'Add Book…' }).length).toBeGreaterThan(0)
  })
})

describe('KanbanBoard keyboard reorder semantics', () => {
  const items = [
    { id: 'a', type: 'book', title: 'Dune', creator: 'Frank Herbert', status: 'To Read' },
  ]

  it('keeps the card buttons out of a role=button wrapper', () => {
    render(<KanbanBoard items={items} mediaType="book" onUpdate={() => {}} />)
    const editButton = screen.getByRole('button', { name: 'Edit' })
    expect(editButton.closest('[role="button"]')).toBeNull()
    expect(editButton.closest('[role="group"]')).not.toBeNull()
  })

  it('names each column heading and its open-vault button', () => {
    render(<KanbanBoard items={items} mediaType="book" onUpdate={() => {}} />)
    expect(screen.getByRole('button', { name: 'To Read — open vault' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: /To Read/ })).not.toBeNull()
  })
})
