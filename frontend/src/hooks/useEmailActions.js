import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getEmailsQueryKeyPattern(userId) {
  return ['emails', userId ?? 'anonymous']
}

export function useEmailActions(userId, folder, accountId) {
  const queryClient = useQueryClient()
  const [sendError, setSendError] = useState(null)

  const currentQueryKey = ['emails', userId ?? 'anonymous', folder ?? 'inbox', accountId ?? 'all']

  // --- Optimistic mutations ---

  const markRead = useMutation({
    mutationFn: ({ emailId, isRead }) =>
      apiFetch(`/api/email/${emailId}/read`, {
        method: 'PATCH',
        body: { is_read: isRead },
      }),
    onMutate: async ({ emailId, isRead }) => {
      await queryClient.cancelQueries({ queryKey: currentQueryKey })
      const previous = queryClient.getQueryData(currentQueryKey) ?? []
      queryClient.setQueryData(
        currentQueryKey,
        previous.map((e) => (e.id === emailId ? { ...e, is_read: isRead } : e)),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(currentQueryKey, context?.previous ?? [])
    },
    onSuccess: (serverData, { emailId }) => {
      queryClient.setQueryData(currentQueryKey, (current) =>
        (current ?? []).map((e) => (e.id === emailId ? { ...e, ...serverData } : e)),
      )
    },
  })

  const toggleStar = useMutation({
    mutationFn: ({ emailId, isStarred }) =>
      apiFetch(`/api/email/${emailId}/star`, {
        method: 'PATCH',
        body: { is_starred: isStarred },
      }),
    onMutate: async ({ emailId, isStarred }) => {
      await queryClient.cancelQueries({ queryKey: currentQueryKey })
      const previous = queryClient.getQueryData(currentQueryKey) ?? []
      queryClient.setQueryData(
        currentQueryKey,
        previous.map((e) => (e.id === emailId ? { ...e, is_starred: isStarred } : e)),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(currentQueryKey, context?.previous ?? [])
    },
    onSuccess: (serverData, { emailId }) => {
      queryClient.setQueryData(currentQueryKey, (current) =>
        (current ?? []).map((e) => (e.id === emailId ? { ...e, ...serverData } : e)),
      )
    },
  })

  const moveToFolder = useMutation({
    mutationFn: ({ emailId, targetFolder }) =>
      apiFetch(`/api/email/${emailId}/move`, {
        method: 'PATCH',
        body: { folder: targetFolder },
      }),
    onMutate: async ({ emailId }) => {
      await queryClient.cancelQueries({ queryKey: currentQueryKey })
      const previous = queryClient.getQueryData(currentQueryKey) ?? []
      // Remove from current view optimistically
      queryClient.setQueryData(
        currentQueryKey,
        previous.filter((e) => e.id !== emailId),
      )
      return { previous }
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData(currentQueryKey, context?.previous ?? [])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: getEmailsQueryKeyPattern(userId) })
    },
  })

  // --- Non-optimistic mutations ---

  const sendEmail = useMutation({
    mutationFn: (data) =>
      apiFetch('/api/email/send', { method: 'POST', body: data }),
    onError: (error) => setSendError(error.message),
    onSuccess: () => {
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: getEmailsQueryKeyPattern(userId) })
    },
  })

  const replyEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      apiFetch(`/api/email/${emailId}/reply`, { method: 'POST', body: data }),
    onError: (error) => setSendError(error.message),
    onSuccess: () => {
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: getEmailsQueryKeyPattern(userId) })
    },
  })

  const forwardEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      apiFetch(`/api/email/${emailId}/forward`, { method: 'POST', body: data }),
    onError: (error) => setSendError(error.message),
    onSuccess: () => setSendError(null),
  })

  const aiDraft = useMutation({
    mutationFn: (data) =>
      apiFetch('/api/email/ai/draft', { method: 'POST', body: data }),
  })

  const aiSummarize = useMutation({
    mutationFn: (data) =>
      apiFetch('/api/email/ai/summarize', { method: 'POST', body: data }),
  })

  const isSending =
    sendEmail.isPending || replyEmail.isPending || forwardEmail.isPending

  return {
    markRead: markRead.mutateAsync,
    toggleStar: toggleStar.mutateAsync,
    moveToFolder: moveToFolder.mutateAsync,
    sendEmail: sendEmail.mutateAsync,
    replyEmail: replyEmail.mutateAsync,
    forwardEmail: forwardEmail.mutateAsync,
    aiDraft: aiDraft.mutateAsync,
    aiSummarize: aiSummarize.mutateAsync,
    isSending,
    sendError,
  }
}
