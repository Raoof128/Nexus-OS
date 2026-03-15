import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

export function useChatSessions() {
  const queryClient = useQueryClient()

  const sessionsQuery = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => apiFetch('/chat/sessions'),
    staleTime: 30_000,
  })

  const createSession = useMutation({
    mutationFn: (data) =>
      apiFetch('/chat/sessions', { method: 'POST', body: data }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat-sessions'] }),
  })

  const deleteSession = useMutation({
    mutationFn: (sessionId) =>
      apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['chat-sessions'] }),
  })

  return {
    sessions: sessionsQuery.data ?? [],
    loading: sessionsQuery.isPending,
    createSession: createSession.mutateAsync,
    deleteSession: deleteSession.mutateAsync,
  }
}

export function useChatMessages(sessionId) {
  const queryClient = useQueryClient()
  const queryKey = ['chat-messages', sessionId]

  const messagesQuery = useQuery({
    queryKey,
    enabled: Boolean(sessionId),
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
