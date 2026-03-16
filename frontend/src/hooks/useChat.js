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
    mutationFn: (data) =>
      apiFetch('/chat/sessions', { method: 'POST', body: data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const deleteSession = useMutation({
    mutationFn: (sessionId) =>
      apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    sessions: sessionsQuery.data ?? [],
    loading: sessionsQuery.isPending,
    createSession: createSession.mutateAsync,
    deleteSession: deleteSession.mutateAsync,
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
    onSuccess: (aiResponse) => {
      queryClient.setQueryData(queryKey, (current = []) => [
        ...current,
        { id: `ai-${Date.now()}`, role: 'model', content: aiResponse.content, created_at: new Date().toISOString() },
      ])
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(queryKey, context?.previous ?? [])
    },
  })

  return {
    messages: messagesQuery.data ?? [],
    loading: messagesQuery.isPending,
    sending: sendMessage.isPending,
    sendMessage: sendMessage.mutateAsync,
    error: sendMessage.error?.message ?? null,
  }
}
