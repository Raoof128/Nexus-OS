import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { realtimeClient } from '../lib/realtimeClient'

function getEmailsQueryKey(userId, folder, accountId) {
  return ['emails', userId ?? 'anonymous', folder ?? 'inbox', accountId ?? 'all']
}

/**
 * Handles a Realtime DELETE by removing the item from the emails cache.
 * Exported for unit testing.
 */
export function handleEmailRealtimeDelete(oldData, payload) {
  const oldItem = payload.old
  if (!oldItem?.id) return oldData
  return oldData.filter((email) => email.id !== oldItem.id)
}

async function fetchEmails({ userId, folder, accountId, cursor = null }) {
  let query = realtimeClient
    .from('nexus_emails')
    .select('*')
    .eq('user_id', userId)
    .order('provider_date', { ascending: false })
    .limit(50)

  if (folder === 'starred') {
    query = query.eq('is_starred', true)
  } else {
    query = query.eq('folder', folder)
  }

  if (accountId && accountId !== 'all') {
    query = query.eq('account_id', accountId)
  }

  if (cursor) {
    query = query.lt('provider_date', cursor)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data ?? []
}

export function useEmails(session, folder = 'inbox', accountId = 'all') {
  const queryClient = useQueryClient()
  const userId = session?.user?.id
  const isAuthenticated = Boolean(userId)
  const accessToken = session?.access_token
  const emailsQueryKey = useMemo(
    () => getEmailsQueryKey(userId, folder, accountId),
    [userId, folder, accountId],
  )

  // Cursor for pagination — last email's provider_date
  const [_cursor, setCursor] = useState(null)
  // Extra pages loaded via loadMore, accumulated
  const [extraEmails, setExtraEmails] = useState([])

  const emailsQuery = useQuery({
    queryKey: emailsQueryKey,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
    queryFn: () => fetchEmails({ userId, folder, accountId }),
  })

  // Reset extra emails when query key changes (folder/account switch)
  const prevKeyRef = useRef(emailsQueryKey)
  useEffect(() => {
    if (prevKeyRef.current !== emailsQueryKey) {
      setExtraEmails([])
      setCursor(null)
      prevKeyRef.current = emailsQueryKey
    }
  }, [emailsQueryKey])

  // --- Supabase Realtime subscription ---
  useEffect(() => {
    if (!isAuthenticated || !accessToken) return

    realtimeClient.realtime.setAuth(accessToken)

    const channel = realtimeClient
      .channel(`emails-sync-${userId}-${folder}-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nexus_emails',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            queryClient.setQueryData(
              emailsQueryKey,
              (current) => handleEmailRealtimeDelete(current ?? [], payload),
            )
            setExtraEmails((prev) => handleEmailRealtimeDelete(prev, payload))
          } else {
            // INSERT / UPDATE — invalidate so the fresh row is fetched via API
            queryClient.invalidateQueries({ queryKey: emailsQueryKey })
          }
        },
      )
      .subscribe()

    return () => {
      realtimeClient.removeChannel(channel)
    }
  }, [isAuthenticated, accessToken, userId, folder, accountId, emailsQueryKey, queryClient])

  const loadingMoreRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    const all = [...(emailsQuery.data ?? []), ...extraEmails]
    if (all.length === 0) return
    const lastEmail = all[all.length - 1]
    const newCursor = lastEmail.provider_date
    setCursor(newCursor)

    loadingMoreRef.current = true
    try {
      const nextPage = await fetchEmails({ userId, folder, accountId, cursor: newCursor })
      setExtraEmails((prev) => [...prev, ...nextPage])
    } finally {
      loadingMoreRef.current = false
    }
  }, [emailsQuery.data, extraEmails, userId, folder, accountId])

  const search = useCallback(
    async (term) => {
      if (!term?.trim()) return emailsQuery.data ?? []

      let query = realtimeClient
        .from('nexus_emails')
        .select('*')
        .eq('user_id', userId)
        .textSearch('body_text', term, { type: 'websearch' })
        .order('provider_date', { ascending: false })
        .limit(50)

      if (accountId && accountId !== 'all') {
        query = query.eq('account_id', accountId)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data ?? []
    },
    [userId, accountId, emailsQuery.data],
  )

  const emails = useMemo(
    () => [...(emailsQuery.data ?? []), ...extraEmails],
    [emailsQuery.data, extraEmails],
  )

  return {
    emails,
    loading: emailsQuery.isPending,
    error: emailsQuery.error?.message ?? null,
    refetch: emailsQuery.refetch,
    loadMore,
    search,
  }
}
