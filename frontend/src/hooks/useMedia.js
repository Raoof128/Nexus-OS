import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { realtimeClient } from '../lib/realtimeClient'

function getMediaQueryKey(session, type) {
  return ['media', session?.user?.id ?? 'anonymous', type]
}

/**
 * Pure function that applies a Realtime event to the current cache.
 * Exported for unit testing.
 */
export function handleRealtimeEvent(oldData, payload) {
  const { eventType } = payload
  const newItem = payload.new
  const oldItem = payload.old

  switch (eventType) {
    case 'INSERT': {
      // Skip if optimistic update already added this item
      if (oldData.some((item) => item.id === newItem.id)) {
        return oldData
      }
      return [newItem, ...oldData]
    }
    case 'UPDATE': {
      const existing = oldData.find((item) => item.id === newItem.id)
      // Shallow equality dedup — skip if optimistic update already applied
      if (existing && JSON.stringify(existing) === JSON.stringify(newItem)) {
        return oldData
      }
      return oldData.map((item) => (item.id === newItem.id ? newItem : item))
    }
    case 'DELETE': {
      return oldData.filter((item) => item.id !== oldItem.id)
    }
    default:
      return oldData
  }
}

export function useMedia(session, type = 'book') {
  const queryClient = useQueryClient()
  const mediaQueryKey = getMediaQueryKey(session, type)
  const isAuthenticated = Boolean(session?.user?.id)
  const accessToken = session?.access_token

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch(`/media?type=${type}`),
  })

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    realtimeClient.realtime.setAuth(accessToken)

    const channel = realtimeClient
      .channel(`media-sync-${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const targetType = payload.new?.type || payload.old?.type
          if (targetType !== type) return

          queryClient.setQueryData(
            mediaQueryKey,
            (current) => handleRealtimeEvent(current ?? [], payload),
          )
        },
      )
      .subscribe()

    return () => {
      realtimeClient.removeChannel(channel)
    }
  }, [isAuthenticated, accessToken, type, session?.user?.id, mediaQueryKey, queryClient])

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
        id: `optimistic-${Date.now()}`,
      }
      queryClient.setQueryData(mediaQueryKey, [...previous, optimistic])
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
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
        previous.map((item) =>
          item.id === mediaId ? { ...item, ...data } : item,
        ),
      )
      return { previous }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(mediaQueryKey, context?.previous ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
    },
  })

  const deleteMediaMutation = useMutation({
    mutationFn: (mediaId) =>
      apiFetch(`/media/${mediaId}`, { method: 'DELETE' }),
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
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: mediaQueryKey })
    },
  })

  return {
    items: mediaQuery.data ?? [],
    loading: mediaQuery.isPending || mediaQuery.isFetching || addMediaMutation.isPending,
    error: mediaQuery.error?.message ?? addMediaMutation.error?.message ?? null,
    refetch: mediaQuery.refetch,
    addMedia: addMediaMutation.mutateAsync,
    updateMedia: updateMediaMutation.mutateAsync,
    deleteMedia: deleteMediaMutation.mutateAsync,
  }
}
