import { useCallback, useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

const EMAIL_PAGE_SIZE = 50

export function getEmailsQueryKey(userId, folder, accountId, searchTerm = '') {
  return ['emails', userId ?? 'anonymous', folder ?? 'inbox', accountId ?? 'all', searchTerm.trim()]
}

export function buildEmailsPath({
  folder = 'inbox',
  accountId = 'all',
  searchTerm = '',
  cursor = null,
  limit = EMAIL_PAGE_SIZE,
}) {
  const params = new URLSearchParams({ folder, limit: String(limit) })
  if (accountId && accountId !== 'all') params.set('account_id', accountId)
  if (searchTerm.trim()) params.set('search', searchTerm.trim())
  if (cursor) {
    params.set('cursor_date', cursor.provider_date)
    params.set('cursor_id', cursor.id)
  }
  return `/api/email/messages?${params.toString()}`
}

/** Update every page in an infinite email query without losing page metadata. */
export function mapEmailPages(oldData, updateItems) {
  if (!oldData?.pages) return oldData
  return {
    ...oldData,
    pages: oldData.pages.map((page) => ({
      ...page,
      items: updateItems(page.items ?? []),
    })),
  }
}

export function useEmails(session, folder = 'inbox', accountId = 'all', searchTerm = '') {
  const userId = session?.user?.id
  const isAuthenticated = Boolean(userId)
  const normalizedSearch = searchTerm.trim()
  const emailsQueryKey = useMemo(
    () => getEmailsQueryKey(userId, folder, accountId, normalizedSearch),
    [userId, folder, accountId, normalizedSearch],
  )

  const emailsQuery = useInfiniteQuery({
    queryKey: emailsQueryKey,
    enabled: isAuthenticated,
    staleTime: 30_000,
    retry: 1,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      apiFetch(
        buildEmailsPath({
          folder,
          accountId,
          searchTerm: normalizedSearch,
          cursor: pageParam,
        }),
      ),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  })

  const loadMore = useCallback(() => {
    if (!emailsQuery.hasNextPage || emailsQuery.isFetchingNextPage) return Promise.resolve()
    return emailsQuery.fetchNextPage()
  }, [emailsQuery])

  const emails = useMemo(
    () => emailsQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [emailsQuery.data],
  )

  return {
    emails,
    loading: emailsQuery.isPending,
    loadingMore: emailsQuery.isFetchingNextPage,
    hasMore: Boolean(emailsQuery.hasNextPage),
    error: emailsQuery.error?.message ?? null,
    refetch: emailsQuery.refetch,
    loadMore,
  }
}
