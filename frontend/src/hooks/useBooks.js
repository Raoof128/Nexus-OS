import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../lib/apiClient'

function getBooksQueryKey(session) {
  return ['books', session?.user?.id ?? 'anonymous']
}

export function useBooks(session) {
  const queryClient = useQueryClient()
  const booksQueryKey = getBooksQueryKey(session)
  const isAuthenticated = Boolean(session?.user?.id)

  const booksQuery = useQuery({
    queryKey: booksQueryKey,
    enabled: isAuthenticated,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => apiFetch('/books'),
  })

  const addBookMutation = useMutation({
    mutationFn: (bookData) =>
      apiFetch('/books', {
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

  const updateBookMutation = useMutation({
    mutationFn: ({ bookId, data }) =>
      apiFetch(`/books/${bookId}`, {
        method: 'PUT',
        body: data,
      }),
    onMutate: async ({ bookId, data }) => {
      await queryClient.cancelQueries({ queryKey: booksQueryKey })
      const previousBooks = queryClient.getQueryData(booksQueryKey) ?? []
      queryClient.setQueryData(
        booksQueryKey,
        previousBooks.map((book) =>
          book.id === bookId ? { ...book, ...data } : book,
        ),
      )
      return { previousBooks }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(booksQueryKey, context?.previousBooks ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: booksQueryKey })
    },
  })

  const deleteBookMutation = useMutation({
    mutationFn: (bookId) =>
      apiFetch(`/books/${bookId}`, { method: 'DELETE' }),
    onMutate: async (bookId) => {
      await queryClient.cancelQueries({ queryKey: booksQueryKey })
      const previousBooks = queryClient.getQueryData(booksQueryKey) ?? []
      queryClient.setQueryData(
        booksQueryKey,
        previousBooks.filter((book) => book.id !== bookId),
      )
      return { previousBooks }
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(booksQueryKey, context?.previousBooks ?? [])
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: booksQueryKey })
    },
  })

  return {
    books: booksQuery.data ?? [],
    loading:
      booksQuery.isPending || booksQuery.isFetching || addBookMutation.isPending,
    error: booksQuery.error?.message ?? addBookMutation.error?.message ?? null,
    fetchBooks: booksQuery.refetch,
    addBook: addBookMutation.mutateAsync,
    updateBook: updateBookMutation.mutateAsync,
    deleteBook: deleteBookMutation.mutateAsync,
  }
}
