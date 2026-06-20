import { describe, expect, it } from 'vitest'
import { groupVisibleTasks } from '../lib/taskGrouping'

describe('groupVisibleTasks', () => {
  it('surfaces active subtasks when their parent is completed', () => {
    const grouped = groupVisibleTasks(
      [
        {
          id: 'parent',
          title: 'Parent',
          status: 'completed',
          parent_id: null,
          position: 1,
        },
        {
          id: 'child',
          title: 'Child',
          status: 'needsAction',
          parent_id: 'parent',
          position: 2,
        },
      ],
      'myorder',
    )

    expect(grouped.parents.map((task) => task.id)).toEqual(['child'])
    expect(grouped.childrenByParent).toEqual({})
    expect(grouped.completed.map((task) => task.id)).toEqual(['parent'])
  })
})
