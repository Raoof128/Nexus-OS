import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getMediaQueryKey(userId, type) {
  return ['media', userId ?? 'anonymous', type]
}

let optimisticSequence = 0

export function createOptimisticMediaId() {
  const uniquePart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${(++optimisticSequence).toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`
  return `optimistic-${uniquePart}`
}

export function replaceOptimisticMedia(items, optimisticId, serverData) {
  return items.map((item) => (item.id === optimisticId ? serverData : item))
}

// Put a removed entry back where it was (delete rollback). Leaves the list
// alone when the entry is already present.
function restoreItemAt(items, item, index) {
  if (items.some((existing) => existing.id === item.id)) return items
  const next = items.slice()
  next.splice(Math.min(index, next.length), 0, item)
  return next
}

// Undo only the fields one update touched, so a failed write never reverts a
// concurrent change to other fields or other entries.
function revertFields(items, mediaId, previousFields) {
  return items.map((item) => (item.id === mediaId ? { ...item, ...previousFields } : item))
}

/**
 * Media list for one type. `error` is the list load error only: a failed
 * create, update or delete is thrown back to the caller (which shows it where
 * the action happened) and never replaces the list.
 */
export function useMedia(session, type = 'book') {
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const isAuthenticated = Boolean(userId)
  const mediaQueryKey = useMemo(() => getMediaQueryKey(userId, type), [userId, type])

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: () => apiFetch(`/media?type=${type}`),
  })

  const addMediaMutation = useMutation({
    mutationFn: (data) =>
      apiFetch('/media', {
        method: 'POST',
        body: { ...data, type },
      }),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const optimistic = {
        ...data,
        type,
        id: createOptimisticMediaId(),
      }
      queryClient.setQueryData(mediaQueryKey, (current) => [...(current ?? []), optimistic])
      return { optimisticId: optimistic.id }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, (current) =>
        (current ?? []).filter((item) => item.id !== context?.optimisticId),
      )
    },
    onSuccess: (serverData, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, (current) =>
        replaceOptimisticMedia(current ?? [], context?.optimisticId, serverData),
      )
    },
  })

  const updateMediaMutation = useMutation({
    mutationFn: ({ mediaId, data }) =>
      apiFetch(`/media/${mediaId}`, {
        method: 'PUT',
        body: data,
      }),
    onMutate: async ({ mediaId, data }) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const current = queryClient.getQueryData(mediaQueryKey) ?? []
      const target = current.find((item) => item.id === mediaId)
      const previousFields = target
        ? Object.fromEntries(Object.keys(data).map((key) => [key, target[key]]))
        : null
      queryClient.setQueryData(
        mediaQueryKey,
        current.map((item) => (item.id === mediaId ? { ...item, ...data } : item)),
      )
      return { previousFields }
    },
    onError: (_error, { mediaId }, context) => {
      if (!context?.previousFields) return
      queryClient.setQueryData(mediaQueryKey, (current) =>
        revertFields(current ?? [], mediaId, context.previousFields),
      )
    },
    onSuccess: (serverData, { mediaId }) => {
      queryClient.setQueryData(mediaQueryKey, (current) =>
        (current ?? []).map((item) => (item.id === mediaId ? serverData : item)),
      )
    },
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId) => apiFetch(`/media/${mediaId}`, { method: 'DELETE' }),
    onMutate: async (mediaId) => {
      await queryClient.cancelQueries({ queryKey: mediaQueryKey })
      const current = queryClient.getQueryData(mediaQueryKey) ?? []
      const index = current.findIndex((item) => item.id === mediaId)
      queryClient.setQueryData(
        mediaQueryKey,
        current.filter((item) => item.id !== mediaId),
      )
      return { removed: index >= 0 ? current[index] : null, index }
    },
    onError: (_error, _mediaId, context) => {
      if (!context?.removed) return
      queryClient.setQueryData(mediaQueryKey, (current) =>
        restoreItemAt(current ?? [], context.removed, context.index),
      )
    },
    // No invalidateQueries on success: the optimistic removal already matches
    // the server outcome. Invalidating here triggered a refetch that raced
    // Realtime DELETE events and briefly reintroduced the deleted item.
  })

  return {
    items: mediaQuery.data ?? [],
    loading: mediaQuery.isPending,
    error: mediaQuery.error?.message ?? null,
    refreshing: mediaQuery.isFetching,
    refetch: mediaQuery.refetch,
    addMedia: addMediaMutation.mutateAsync,
    updateMedia: updateMediaMutation.mutateAsync,
    deleteMedia: deleteMediaMutation.mutateAsync,
  }
}
