import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getChatSessionsQueryKey(userId) {
  return ['chat-sessions', userId ?? 'anonymous']
}

function getChatMessagesQueryKey(userId, sessionId) {
  return ['chat-messages', userId ?? 'anonymous', sessionId ?? 'none']
}

export function useChatSessions(userId) {
  const queryClient = useQueryClient()
  const queryKey = getChatSessionsQueryKey(userId)

  const sessionsQuery = useQuery({
    queryKey,
    enabled: Boolean(userId),
    queryFn: () => apiFetch('/chat/sessions'),
    staleTime: 30_000,
  })

  const createSession = useMutation({
    mutationFn: (data) => apiFetch('/chat/sessions', { method: 'POST', body: data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteSession = useMutation({
    mutationFn: (sessionId) => apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    sessions: sessionsQuery.data ?? [],
    loading: sessionsQuery.isPending,
    createSession: createSession.mutateAsync,
    deleteSession: deleteSession.mutateAsync,
    isCreating: createSession.isPending,
  }
}

export function useChatMessages(userId, sessionId) {
  const queryClient = useQueryClient()
  const queryKey = getChatMessagesQueryKey(userId, sessionId)

  const messagesQuery = useQuery({
    queryKey,
    enabled: Boolean(userId && sessionId),
    queryFn: () => apiFetch(`/chat/sessions/${sessionId}/messages`),
    staleTime: 10_000,
  })

  const sendMessage = useMutation({
    mutationFn: (content) =>
      apiFetch(`/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: { content },
      }),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData(queryKey) ?? []
      queryClient.setQueryData(queryKey, [
        ...previous,
        { id: `opt-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() },
      ])
      return { previous }
    },
    onSuccess: () => {
      // Trust the invalidate + refetch to bring in the server's canonical user
      // and AI rows (with real IDs/timestamps). Appending a synthetic `ai-...`
      // message here just causes a render with a non-stable ID that the refetch
      // then replaces — pure churn and a risk of double-rendering.
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on session switch only, not on mutation identity change
  useEffect(() => {
    sendMessage.reset()
  }, [sessionId])

  return {
    messages: messagesQuery.data ?? [],
    loading: messagesQuery.isPending,
    sending: sendMessage.isPending,
    sendMessage: sendMessage.mutateAsync,
    error: sendMessage.error?.message ?? null,
  }
}
