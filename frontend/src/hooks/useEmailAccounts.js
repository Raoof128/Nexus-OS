import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getEmailAccountsQueryKey(userId) {
  return ['email-accounts', userId ?? 'anonymous']
}

export function useEmailAccounts(userId) {
  const queryClient = useQueryClient()
  const queryKey = getEmailAccountsQueryKey(userId)

  const accountsQuery = useQuery({
    queryKey,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch('/api/email/accounts'),
  })

  const disconnectMutation = useMutation({
    mutationFn: (accountId) =>
      apiFetch(`/api/email/accounts/${accountId}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  return {
    accounts: accountsQuery.data ?? [],
    loading: accountsQuery.isPending,
    error: accountsQuery.error?.message ?? disconnectMutation.error?.message ?? null,
    disconnect: disconnectMutation.mutateAsync,
  }
}
