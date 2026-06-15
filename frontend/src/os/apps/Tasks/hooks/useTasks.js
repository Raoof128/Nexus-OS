import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../../../lib/apiClient'

const listsKey = ['tasks', 'lists']
const itemsKey = (listId, showCompleted) => ['tasks', 'items', listId, showCompleted]

export function useTaskLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: () => apiFetch('/api/tasks/lists'),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useTaskItems(listId, showCompleted = true) {
  return useQuery({
    queryKey: itemsKey(listId, showCompleted),
    enabled: Boolean(listId),
    queryFn: () =>
      apiFetch(`/api/tasks/lists/${listId}/items?showCompleted=${showCompleted}`),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useTaskMutations(listId, showCompleted = true) {
  const qc = useQueryClient()
  const key = itemsKey(listId, showCompleted)

  const createList = useMutation({
    mutationFn: (name) =>
      apiFetch('/api/tasks/lists', { method: 'POST', body: { name } }),
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
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const moveTask = useMutation({
    mutationFn: ({ id, body }) =>
      apiFetch(`/api/tasks/items/${id}/move`, { method: 'POST', body }),
    onMutate: async ({ id, body }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...body } : t)),
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const deleteTask = useMutation({
    mutationFn: (id) => apiFetch(`/api/tasks/items/${id}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData(key)
      qc.setQueryData(key, (old = []) => old.filter((t) => t.id !== id))
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(key, ctx.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })

  const clearCompleted = useMutation({
    mutationFn: () =>
      apiFetch(`/api/tasks/lists/${listId}/clear-completed`, { method: 'POST' }),
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
