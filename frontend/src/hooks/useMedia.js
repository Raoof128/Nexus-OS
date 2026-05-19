import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { realtimeClient } from '../lib/realtimeClient'

function getMediaQueryKey(userId, type) {
  return ['media', userId ?? 'anonymous', type]
}

/**
 * Handles a Realtime DELETE by removing the item from cache directly.
 * For INSERT and UPDATE events, we use invalidateQueries instead of
 * touching the cache — the raw Postgres row from Realtime may contain
 * encrypted fields or stale timestamps that would corrupt the hydrated
 * cache managed by React Query + the API layer.
 * Exported for unit testing.
 */
export function handleRealtimeDelete(oldData, payload) {
  const oldItem = payload.old
  if (!oldItem?.id) return oldData
  return oldData.filter((item) => item.id !== oldItem.id)
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

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    // Keep Realtime auth in sync with the current access token
    realtimeClient.realtime.setAuth(accessToken)

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

          // Only handle DELETEs from Realtime — safe since no field data needed.
          // INSERT/UPDATE events are intentionally ignored: the raw Postgres row
          // contains encrypted fields and server-only timestamps that corrupt the
          // hydrated cache. User mutations are fully handled by the optimistic
          // update + onSuccess pattern. External changes are picked up when the
          // query becomes stale (staleTime: 60s).
          if (payload.eventType === 'DELETE') {
            queryClient.setQueryData(mediaQueryKey, (current) =>
              handleRealtimeDelete(current ?? [], payload),
            )
          }
        },
      )
      .subscribe()

    return () => {
      realtimeClient.removeChannel(channel)
    }
  }, [isAuthenticated, accessToken, userId, type, mediaQueryKey, queryClient])

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
    onSuccess: (serverData) => {
      queryClient.setQueryData(mediaQueryKey, (current) =>
        (current ?? []).map((item) =>
          item.id?.toString().startsWith('optimistic-') ? serverData : item,
        ),
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
