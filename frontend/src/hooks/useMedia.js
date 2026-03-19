import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { realtimeClient } from '../lib/realtimeClient'

function getMediaQueryKey(userId, type) {
  return ['media', userId ?? 'anonymous', type]
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
      if (!existing) return oldData
      // Strict status dedup: the optimistic update already applied the new
      // status to the cache. If the Realtime echo carries the same status,
      // returning oldData silently drops the event so Framer Motion does not
      // re-trigger the layout animation. server-side fields like updated_at
      // intentionally differ, so a full JSON.stringify comparison always fails.
      if (existing.status === newItem.status) {
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
  const userId = session?.user?.id
  const isAuthenticated = Boolean(userId)
  const accessToken = session?.access_token
  const mediaQueryKey = useMemo(() => getMediaQueryKey(userId, type), [userId, type])

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch(`/media?type=${type}`),
  })

  // Keep Realtime auth in sync with the current access token
  useEffect(() => {
    if (!accessToken) return
    realtimeClient.realtime.setAuth(accessToken)
  }, [accessToken])

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    const channel = realtimeClient
      .channel(`media-sync-${userId}-${type}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media',
          filter: `user_id=eq.${userId}`,
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
  }, [isAuthenticated, userId, type, mediaQueryKey, queryClient])

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
