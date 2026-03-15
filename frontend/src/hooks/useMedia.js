import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getMediaQueryKey(session, type) {
  return ['media', session?.user?.id ?? 'anonymous', type]
}

export function useMedia(session, type = 'book') {
  const queryClient = useQueryClient()
  const mediaQueryKey = getMediaQueryKey(session, type)
  const isAuthenticated = Boolean(session?.user?.id)

  const mediaQuery = useQuery({
    queryKey: mediaQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
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
    addMedia: addMediaMutation.mutateAsync,
    updateMedia: updateMediaMutation.mutateAsync,
    deleteMedia: deleteMediaMutation.mutateAsync,
  }
}
