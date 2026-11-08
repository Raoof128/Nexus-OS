import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'
import { mapEmailPages } from './useEmails'

function getEmailsQueryKeyPattern(userId) {
  return ['emails', userId ?? 'anonymous']
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function createOutboundEmailSender(requestFn = apiFetch) {
  const attempts = new Map()

  return async (operation, path, data) => {
    const fingerprint = JSON.stringify(data)
    let attempt = attempts.get(operation)
    if (!attempt || attempt.fingerprint !== fingerprint) {
      attempt = { fingerprint, key: createIdempotencyKey() }
      attempts.set(operation, attempt)
    }

    // A failed request is ambiguous: the provider may already have accepted
    // the message. Only success clears the key, so a same-payload retry is
    // safely coalesced by the backend.
    const result = await requestFn(path, {
      method: 'POST',
      body: data,
      headers: { 'Idempotency-Key': attempt.key },
    })
    if (attempts.get(operation) === attempt) attempts.delete(operation)
    return result
  }
}

export function updateEmailInCache(data, emailId, update) {
  return mapEmailPages(data, (items) =>
    items.map((email) => (email.id === emailId ? update(email) : email)),
  )
}

export function removeEmailFromCache(data, emailId) {
  return mapEmailPages(data, (items) => items.filter((email) => email.id !== emailId))
}

/**
 * Where one message sits in one cached email query, taken before an optimistic
 * change. Returns null when the message is not in that query.
 */
export function snapshotEmailEntry(data, emailId) {
  const pages = data?.pages ?? []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const items = pages[pageIndex].items ?? []
    const index = items.findIndex((email) => email.id === emailId)
    if (index !== -1) return { emailId, pageIndex, index, email: items[index] }
  }
  return null
}

/**
 * Undo one message's optimistic change without touching anything else in the
 * query. If the message is still listed, only the fields the mutation changed
 * (`keys`) go back to their snapshot values. If it was removed, it is put back
 * at its old position. Other messages, and changes from concurrent successful
 * mutations, are left as they are.
 */
export function restoreEmailEntry(data, entry, keys) {
  if (!entry || !data?.pages) return data
  const present = data.pages.some((page) =>
    (page.items ?? []).some((email) => email.id === entry.emailId),
  )
  if (present) {
    const fields = keys
      ? Object.fromEntries(keys.map((key) => [key, entry.email[key]]))
      : entry.email
    return updateEmailInCache(data, entry.emailId, (email) => ({ ...email, ...fields }))
  }
  return {
    ...data,
    pages: data.pages.map((page, pageIndex) => {
      if (pageIndex !== entry.pageIndex) return page
      const items = [...(page.items ?? [])]
      items.splice(Math.min(entry.index, items.length), 0, entry.email)
      return { ...page, items }
    }),
  }
}

function updateAllEmailQueries(queryClient, userId, updater) {
  const queryPattern = getEmailsQueryKeyPattern(userId)
  queryClient.getQueriesData({ queryKey: queryPattern }).forEach(([queryKey, data]) => {
    queryClient.setQueryData(queryKey, updater(data, queryKey))
  })
}

function captureEmailEntries(queryClient, userId, emailId) {
  const queryPattern = getEmailsQueryKeyPattern(userId)
  return queryClient
    .getQueriesData({ queryKey: queryPattern })
    .map(([queryKey, data]) => [queryKey, snapshotEmailEntry(data, emailId)])
}

function restoreEmailEntries(queryClient, snapshots, keys) {
  snapshots?.forEach(([queryKey, entry]) => {
    if (!entry) return
    queryClient.setQueryData(queryKey, (data) => restoreEmailEntry(data, entry, keys))
  })
}

export function useEmailActions(userId) {
  const queryClient = useQueryClient()
  const [sendError, setSendError] = useState(null)
  const [sendOutbound] = useState(() => createOutboundEmailSender())
  const queryPattern = getEmailsQueryKeyPattern(userId)

  const clearSendError = useCallback(() => setSendError(null), [])

  // --- Optimistic mutations ---

  const markRead = useMutation({
    mutationFn: ({ emailId, isRead }) =>
      apiFetch(`/api/email/${emailId}/read`, {
        method: 'PATCH',
        body: { is_read: isRead },
      }),
    onMutate: async ({ emailId, isRead }) => {
      await queryClient.cancelQueries({ queryKey: queryPattern })
      const snapshots = captureEmailEntries(queryClient, userId, emailId)
      updateAllEmailQueries(queryClient, userId, (data) =>
        updateEmailInCache(data, emailId, (email) => ({ ...email, is_read: isRead })),
      )
      return { snapshots }
    },
    onError: (_error, _vars, context) => {
      restoreEmailEntries(queryClient, context?.snapshots, ['is_read'])
    },
    onSuccess: (serverData, { emailId }) => {
      updateAllEmailQueries(queryClient, userId, (data) =>
        updateEmailInCache(data, emailId, (email) => ({ ...email, ...serverData })),
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
      await queryClient.cancelQueries({ queryKey: queryPattern })
      const snapshots = captureEmailEntries(queryClient, userId, emailId)
      updateAllEmailQueries(queryClient, userId, (data, queryKey) => {
        if (queryKey[2] === 'starred' && !isStarred) {
          return removeEmailFromCache(data, emailId)
        }
        return updateEmailInCache(data, emailId, (email) => ({
          ...email,
          is_starred: isStarred,
        }))
      })
      return { snapshots }
    },
    onError: (_error, _vars, context) => {
      restoreEmailEntries(queryClient, context?.snapshots, ['is_starred'])
    },
    onSuccess: (serverData, { emailId }) => {
      updateAllEmailQueries(queryClient, userId, (data) =>
        updateEmailInCache(data, emailId, (email) => ({ ...email, ...serverData })),
      )
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryPattern })
    },
  })

  const moveToFolder = useMutation({
    mutationFn: ({ emailId, targetFolder }) =>
      apiFetch(`/api/email/${emailId}/move`, {
        method: 'PATCH',
        body: { folder: targetFolder },
      }),
    onMutate: async ({ emailId }) => {
      await queryClient.cancelQueries({ queryKey: queryPattern })
      const snapshots = captureEmailEntries(queryClient, userId, emailId)
      updateAllEmailQueries(queryClient, userId, (data) => removeEmailFromCache(data, emailId))
      return { snapshots }
    },
    onError: (_error, _vars, context) => {
      // The message left the list, so the whole entry goes back in its place.
      restoreEmailEntries(queryClient, context?.snapshots)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryPattern })
    },
  })

  // --- Non-optimistic mutations ---

  const sendEmail = useMutation({
    mutationFn: (data) => sendOutbound('send', '/api/email/send', data),
    onMutate: () => setSendError(null),
    onError: (error) => setSendError(error.message),
    onSuccess: () => {
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: queryPattern })
    },
  })

  const replyEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      sendOutbound(`reply:${emailId}`, `/api/email/${emailId}/reply`, data),
    onMutate: () => setSendError(null),
    onError: (error) => setSendError(error.message),
    onSuccess: () => {
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: queryPattern })
    },
  })

  const forwardEmail = useMutation({
    mutationFn: ({ emailId, data }) =>
      sendOutbound(`forward:${emailId}`, `/api/email/${emailId}/forward`, data),
    onMutate: () => setSendError(null),
    onError: (error) => setSendError(error.message),
    onSuccess: () => {
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: queryPattern })
    },
  })

  const aiDraft = useMutation({
    mutationFn: (data) => apiFetch('/api/email/ai/draft', { method: 'POST', body: data }),
  })

  const aiSummarize = useMutation({
    mutationFn: (data) => apiFetch('/api/email/ai/summarize', { method: 'POST', body: data }),
  })

  const isSending = sendEmail.isPending || replyEmail.isPending || forwardEmail.isPending

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
    clearSendError,
  }
}
