import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TaskMenu from './TaskMenu'

const lists = [
  { id: 'a', name: 'Personal' },
  { id: 'b', name: 'Work' },
]

function renderMenu(
  task = { id: 't1', title: 'Pay rent', list_id: 'a', recurrence: null },
  extra = {},
) {
  const onMoveToList = vi.fn()
  const utils = render(
    <TaskMenu task={task} lists={lists} onMoveToList={onMoveToList} {...extra} />,
  )
  const trigger = screen.getByRole('button', { name: 'More actions for "Pay rent"' })
  return { ...utils, trigger, onMoveToList }
}

describe('TaskMenu', () => {
  it('opens a menu whose children are groups and menuitems', () => {
    const { trigger } = renderMenu()
    fireEvent.click(trigger)
    const menu = screen.getByRole('menu')
    const children = Array.from(menu.querySelectorAll('[role="group"] > *, [role="group"]'))
    expect(children.length).toBeGreaterThan(0)
    // Every direct child of the menu is a group, so no bare <p> sits in role=menu.
    expect(Array.from(menu.children).every((el) => el.getAttribute('role') === 'group')).toBe(true)
    expect(screen.getByRole('menuitem', { name: 'Work' })).not.toBeNull()
    // The current list is not offered as a move target.
    expect(screen.queryByRole('menuitem', { name: 'Personal' })).toBeNull()
  })

  it('moves focus to the first item on open and walks items with arrows, Home and End', () => {
    const { trigger } = renderMenu({
      id: 't1',
      title: 'Pay rent',
      list_id: 'x',
      recurrence: null,
    })
    fireEvent.click(trigger)
    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(2)
    expect(document.activeElement).toBe(items[0])

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Home' })
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(document.activeElement).toBe(items[1])
  })

  it('returns focus to the trigger on Escape', () => {
    const { trigger } = renderMenu()
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('moves the task and returns focus to the trigger on selection', () => {
    const { trigger, onMoveToList } = renderMenu()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Work' }))
    expect(onMoveToList).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('explains why recurring tasks cannot move, using a disabled menuitem', () => {
    const { trigger } = renderMenu({
      id: 't2',
      title: 'Pay rent',
      list_id: 'a',
      recurrence: 'FREQ=MONTHLY',
    })
    fireEvent.click(trigger)
    const notice = screen.getByRole('menuitem', { name: 'Recurring tasks stay in their list' })
    expect(notice.getAttribute('aria-disabled')).toBe('true')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(document.activeElement).not.toBe(notice)
  })

  it('keeps subtasks in their parent list (the API answers 409)', () => {
    const { trigger, onMoveToList } = renderMenu({
      id: 't3',
      title: 'Pay rent',
      list_id: 'a',
      parent_id: 't1',
      recurrence: null,
    })
    fireEvent.click(trigger)
    expect(
      screen.getByRole('menuitem', { name: "Subtasks stay in their parent's list" }),
    ).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Work' })).toBeNull()
    expect(onMoveToList).not.toHaveBeenCalled()
  })

  it('keeps a task with subtasks in its list', () => {
    const { trigger } = renderMenu(undefined, { hasSubtasks: true })
    fireEvent.click(trigger)
    expect(
      screen.getByRole('menuitem', { name: 'Tasks with subtasks stay in their list' }),
    ).toBeTruthy()
  })

  it('shows the trigger at touch size and always visible on coarse pointers', () => {
    const { trigger } = renderMenu()
    expect(trigger.className).toContain('pointer-coarse:h-11')
    expect(trigger.className).toContain('pointer-coarse:opacity-100')
  })
})
