import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../../../lib/apiClient'

const listsKey = ['tasks', 'lists']
const itemsKey = (listId, showCompleted) => ['tasks', 'items', listId, showCompleted]

// Shared with the desktop-level reminder service (hooks/useTaskReminders.js), which
// observes the same cache entries so reminders never fetch a list twice.
export const taskListsKey = listsKey
export const taskItemsKey = itemsKey
export const fetchTaskLists = () => apiFetch('/api/tasks/lists')
export const fetchTaskItems = (listId, showCompleted = true) =>
  apiFetch(`/api/tasks/lists/${listId}/items?showCompleted=${showCompleted}`)

export function useTaskLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: fetchTaskLists,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useTaskItems(listId, showCompleted = true) {
  return useQuery({
    queryKey: itemsKey(listId, showCompleted),
    enabled: Boolean(listId),
    queryFn: () => fetchTaskItems(listId, showCompleted),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useAllTaskItems(lists) {
  const queries = useQueries({
    queries: lists.map((list) => ({
      queryKey: itemsKey(list.id, true),
      queryFn: () => fetchTaskItems(list.id),
    })),
  })
  return {
    data: queries.flatMap((query, i) =>
      (query.data ?? []).map((task) => ({ ...task, list_id: lists[i].id })),
    ),
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    refetch: () => Promise.all(queries.filter((query) => query.isError).map((q) => q.refetch())),
  }
}

export function useTaskMutations(listId, showCompleted = true) {
  const qc = useQueryClient()
  const key = itemsKey(listId, showCompleted)
  const originKey = (taskListId) => (taskListId ? itemsKey(taskListId, true) : key)

  const createList = useMutation({
    mutationFn: (name) => apiFetch('/api/tasks/lists', { method: 'POST', body: { name } }),
    onSettled: () => qc.invalidateQueries({ queryKey: listsKey }),
  })

  const renameList = useMutation({
    mutationFn: ({ id, name }) =>
      apiFetch(`/api/tasks/lists/${id}`, { method: 'PATCH', body: { name } }),
    onSettled: () => qc.invalidateQueries({ queryKey: listsKey }),
  })

  const deleteList = useMutation({
    mutationFn: (id) => apiFetch(`/api/tasks/lists/${id}`, { method: 'DELETE' }),
    onSettled: () => qc.invalidateQueries({ queryKey: listsKey }),
  })

  const reorderList = useMutation({
    mutationFn: ({ id, position }) =>
      apiFetch(`/api/tasks/lists/${id}`, { method: 'PATCH', body: { position } }),
    onSettled: () => qc.invalidateQueries({ queryKey: listsKey }),
  })

  const createTask = useMutation({
    mutationFn: (payload) =>
      apiFetch(`/api/tasks/lists/${listId}/items`, { method: 'POST', body: payload }),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) => [
        ...old,
        { id: `optimistic-${Date.now()}`, status: 'needsAction', ...payload },
      ])
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const updateTask = useMutation({
    mutationFn: ({ id, patch }) =>
      apiFetch(`/api/tasks/items/${id}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch, taskListId }) => {
      const source = originKey(taskListId)
      await qc.cancelQueries({ queryKey: source })
      const previous = qc.getQueryData(source)
      const pendingSchedule = ['due_at', 'due', 'due_timezone', 'all_day'].some((field) =>
        Object.hasOwn(patch, field),
      )
      qc.setQueryData(source, (old = []) =>
        old.map((t) =>
          t.id === id
            ? { ...t, ...patch, pendingSchedule: t.pendingSchedule || pendingSchedule }
            : t,
        ),
      )
      return { previous, source }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(ctx.source, ctx.previous),
    onSuccess: (record, { id, taskListId }) => {
      if (record?.id !== id) return
      const source = originKey(taskListId)
      qc.setQueryData(source, (old) => old?.map((task) => (task.id === id ? record : task)))
    },
    onSettled: (_record, _error, { taskListId }) =>
      qc.invalidateQueries({ queryKey: originKey(taskListId) }),
  })

  const moveTask = useMutation({
    mutationFn: ({ id, body }) => apiFetch(`/api/tasks/items/${id}/move`, { method: 'POST', body }),
    onMutate: async ({ id, body, taskListId }) => {
      const source = originKey(taskListId)
      await qc.cancelQueries({ queryKey: source })
      const previous = qc.getQueryData(source)
      qc.setQueryData(source, (old = []) =>
        body.list_id
          ? old.filter((t) => t.id !== id)
          : old.map((t) => (t.id === id ? { ...t, ...body } : t)),
      )
      return { previous, source }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(ctx.source, ctx.previous),
    onSettled: (_record, _error, { taskListId, body }) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: originKey(taskListId) }),
        body.list_id && qc.invalidateQueries({ queryKey: ['tasks', 'items', body.list_id] }),
      ]),
  })

  const deleteTask = useMutation({
    mutationFn: (task) =>
      apiFetch(`/api/tasks/items/${typeof task === 'string' ? task : task.id}`, {
        method: 'DELETE',
      }),
    onMutate: async (task) => {
      const { id, taskListId } = typeof task === 'string' ? { id: task } : task
      const source = originKey(taskListId)
      await qc.cancelQueries({ queryKey: source })
      const previous = qc.getQueryData(source)
      qc.setQueryData(source, (old = []) => old.filter((t) => t.id !== id))
      return { previous, source }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(ctx.source, ctx.previous),
    onSettled: (_record, _error, task) =>
      qc.invalidateQueries({ queryKey: originKey(task?.taskListId) }),
  })

  const clearCompleted = useMutation({
    mutationFn: () => apiFetch(`/api/tasks/lists/${listId}/clear-completed`, { method: 'POST' }),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) => old.filter((t) => t.status !== 'completed'))
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  return {
    createList,
    renameList,
    deleteList,
    reorderList,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    clearCompleted,
  }
}
