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
    // Load failure for the session list. Callers must show an error, not an
    // empty state, when this is set.
    loadError: sessionsQuery.error ?? null,
    refetch: sessionsQuery.refetch,
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
      const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      queryClient.setQueryData(queryKey, (current = []) => [
        ...current,
        { id: optimisticId, role: 'user', content, created_at: new Date().toISOString() },
      ])
      return { optimisticId }
    },
    onSuccess: () => {
      // Trust the invalidate + refetch to bring in the server's canonical user
      // and AI rows (with real IDs/timestamps). Appending a synthetic `ai-...`
      // message here just causes a render with a non-stable ID that the refetch
      // then replaces — pure churn and a risk of double-rendering.
      queryClient.invalidateQueries({ queryKey })
    },
    onError: (_err, _vars, context) => {
      // Remove only this send's optimistic row. Restoring a whole snapshot
      // would also discard messages that other updates added meanwhile.
      if (!context?.optimisticId) return
      queryClient.setQueryData(queryKey, (current = []) =>
        current.filter((message) => message.id !== context.optimisticId),
      )
    },
  })
  const resetSendMessage = sendMessage.reset

  useEffect(() => {
    resetSendMessage()
  }, [sessionId, resetSendMessage])

  return {
    messages: messagesQuery.data ?? [],
    loading: messagesQuery.isPending,
    // Load failure for this conversation's history (distinct from `error`,
    // which is the send failure).
    loadError: messagesQuery.error ?? null,
    refetch: messagesQuery.refetch,
    sending: sendMessage.isPending,
    sendMessage: sendMessage.mutateAsync,
    error: sendMessage.error?.message ?? null,
  }
}
