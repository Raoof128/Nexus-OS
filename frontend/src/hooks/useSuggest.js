import { useMutation } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

export function useSuggest() {
  const mutation = useMutation({
    mutationFn: () => apiFetch('/books/suggest'),
  })

  return {
    suggestBook: mutation.mutateAsync,
    suggestError: mutation.error?.message ?? null,
    suggesting: mutation.isPending,
  }
}
