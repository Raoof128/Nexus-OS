import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

export function useSuggest(mediaType = 'book') {
  const mutation = useMutation({
    mutationFn: () => apiFetch(`/media/suggest?type=${mediaType}`),
  })

  return {
    suggest: mutation.mutateAsync,
    suggestError: mutation.error?.message ?? null,
    suggesting: mutation.isPending,
    resetSuggest: mutation.reset,
  }
}
