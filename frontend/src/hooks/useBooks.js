import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getBooksQueryKey(session) {
  return ['books', session?.user?.id ?? 'anonymous']
}

export function useBooks(session) {
  const queryClient = useQueryClient()
  const booksQueryKey = getBooksQueryKey(session)
  const isAuthenticated = Boolean(session?.access_token)

  const booksQuery = useQuery({
    queryKey: booksQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch('/books', { session }),
  })

  const addBookMutation = useMutation({
    mutationFn: (bookData) =>
      apiFetch('/books', {
        session,
        method: 'POST',
        body: bookData,
      }),
    onMutate: async (bookData) => {
      await queryClient.cancelQueries({ queryKey: booksQueryKey })
      const previousBooks = queryClient.getQueryData(booksQueryKey) ?? []
      const optimisticBook = {
        ...bookData,
        id: `optimistic-${Date.now()}`,
      }

      queryClient.setQueryData(booksQueryKey, [...previousBooks, optimisticBook])
      return { previousBooks }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(booksQueryKey, context?.previousBooks ?? [])
    },
    onSuccess: (createdBook) => {
      queryClient.setQueryData(booksQueryKey, (currentBooks = []) => [
        ...currentBooks.filter((book) => !String(book.id).startsWith('optimistic-')),
        createdBook,
      ])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: booksQueryKey })
    },
  })

  const suggestBookMutation = useMutation({
    mutationFn: () => apiFetch('/books/suggest', { session }),
  })

  return {
    books: booksQuery.data ?? [],
    loading:
      booksQuery.isPending || booksQuery.isFetching || addBookMutation.isPending,
    error:
      booksQuery.error?.message ??
      addBookMutation.error?.message ??
      null,
    fetchBooks: booksQuery.refetch,
    addBook: addBookMutation.mutateAsync,
    suggestBook: suggestBookMutation.mutateAsync,
    suggestError: suggestBookMutation.error?.message ?? null,
    suggesting: suggestBookMutation.isPending,
  }
}
