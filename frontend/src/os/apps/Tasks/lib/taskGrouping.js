function sortTasks(tasks, mode) {
  const copy = [...tasks]
  if (mode === 'date') {
    copy.sort((a, b) => {
      const da = a.due_at || a.due || '9999'
      const db = b.due_at || b.due || '9999'
      if (da === db) return (a.position || 0) - (b.position || 0)
      return da < db ? -1 : 1
    })
  } else {
    copy.sort((a, b) => (a.position || 0) - (b.position || 0))
  }
  return copy
}

export function groupVisibleTasks(visible, sortMode) {
  const active = visible.filter((t) => t.status === 'needsAction')
  const done = visible.filter((t) => t.status === 'completed')
  const activeParentIds = new Set(active.filter((t) => !t.parent_id).map((t) => t.id))
  const parents = sortTasks(
    active.filter((t) => !t.parent_id || !activeParentIds.has(t.parent_id)),
    sortMode,
  )
  const childrenByParent = {}
  for (const t of active.filter((t) => t.parent_id && activeParentIds.has(t.parent_id))) {
    ;(childrenByParent[t.parent_id] ||= []).push(t)
  }
  for (const key of Object.keys(childrenByParent)) {
    childrenByParent[key] = sortTasks(childrenByParent[key], sortMode)
  }
  return { parents, childrenByParent, completed: sortTasks(done, sortMode) }
}
