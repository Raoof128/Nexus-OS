import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskRow from './TaskRow'

function setup(overrides = {}, props = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onStar: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const task = {
    id: 't1',
    title: 'Water plants',
    status: 'needsAction',
    starred: false,
    list_id: 'a',
    ...overrides,
  }
  const utils = render(
    <ul>
      <TaskRow task={task} {...handlers} {...props} />
    </ul>,
  )
  return { ...utils, ...handlers, task }
}

describe('TaskRow', () => {
  it('uses a native checkbox wired to the 7.css label pattern', () => {
    const { onToggle, task } = setup()
    const checkbox = screen.getByRole('checkbox', { name: 'Complete "Water plants"' })
    expect(checkbox.tagName).toBe('INPUT')
    expect(checkbox.checked).toBe(false)
    const label = checkbox.nextElementSibling
    expect(label.tagName).toBe('LABEL')
    expect(label.getAttribute('for')).toBe(checkbox.id)

    fireEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith(task)
  })

  it('reflects completion on the checkbox without a separate "incomplete" label', () => {
    setup({ status: 'completed' })
    const checkbox = screen.getByRole('checkbox', { name: 'Complete "Water plants"' })
    expect(checkbox.checked).toBe(true)
  })

  it('renders as a list item when standalone and as a div inside a reorder item', () => {
    const { container, unmount } = setup()
    expect(container.querySelector('li[data-task-id="t1"]')).not.toBeNull()
    unmount()

    const { container: inner } = render(
      <ul>
        <li>
          <TaskRow
            task={{ id: 't2', title: 'Inside', status: 'needsAction' }}
            asListItem={false}
            onToggle={() => {}}
            onStar={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        </li>
      </ul>,
    )
    expect(inner.querySelector('div[data-task-id="t2"]')).not.toBeNull()
    expect(inner.querySelector('li > li')).toBeNull()
  })

  it('keeps touch-sized, always-visible row actions on coarse pointers', () => {
    setup()
    const star = screen.getByRole('button', { name: 'Star "Water plants"' })
    const edit = screen.getByRole('button', { name: 'Edit "Water plants"' })
    const del = screen.getByRole('button', { name: 'Delete "Water plants"' })
    for (const btn of [star, edit, del]) {
      expect(btn.className).toContain('pointer-coarse:h-11')
      expect(btn.className).toContain('pointer-coarse:opacity-100')
      expect(btn.className).not.toContain('focus-visible:outline-none')
    }
  })
})
