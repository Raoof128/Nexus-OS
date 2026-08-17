import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getMediaQueryKey(userId, type) {
  return ['media', userId ?? 'anonymous', type]
}

export function createOptimisticMediaId() {
  const uniquePart = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `optimistic-${uniquePart}`
}

export function replaceOptimisticMedia(items, optimisticId, serverData) {
  return items.map((item) => (item.id === optimisticId ? serverData : item))
}

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
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      const optimistic = {
        ...data,
        type,
        id: createOptimisticMediaId(),
      }
      queryClient.setQueryData(mediaQueryKey, [...previous, optimistic])
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
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      queryClient.setQueryData(
        mediaQueryKey,
        previous.map((item) => (item.id === mediaId ? { ...item, ...data } : item)),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
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
      const previous = queryClient.getQueryData(mediaQueryKey) ?? []
      queryClient.setQueryData(
        mediaQueryKey,
        previous.filter((item) => item.id !== mediaId),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    // No invalidateQueries on success: the optimistic removal already matches
    // the server outcome. Invalidating here triggered a refetch that raced
    // Realtime DELETE events and briefly reintroduced the deleted item.
  })

  return {
    items: mediaQuery.data ?? [],
    loading: mediaQuery.isPending,
    error:
      mediaQuery.error?.message ??
      addMediaMutation.error?.message ??
      updateMediaMutation.error?.message ??
      deleteMediaMutation.error?.message ??
      null,
    refetch: mediaQuery.refetch,
    addMedia: addMediaMutation.mutateAsync,
    updateMedia: updateMediaMutation.mutateAsync,
    deleteMedia: deleteMediaMutation.mutateAsync,
  }
}
