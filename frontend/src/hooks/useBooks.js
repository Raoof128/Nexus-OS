import { useMedia } from './useMedia'

export function useBooks(session) {
  const media = useMedia(session, 'book')

  return {
    books: media.items,
    loading: media.loading,
    error: media.error,
    fetchBooks: media.refetch,
    addBook: media.addMedia,
    updateBook: async ({ bookId, data }) =>
      media.updateMedia({ mediaId: bookId, data }),
    deleteBook: media.deleteMedia,
  }
}
