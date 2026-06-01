import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionReader(bookId, chapter) {
  const [verses, setVerses] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!bookId || !chapter) {
      return
    }

    let cancelled = false

    async function fetchVerses() {
      setIsLoading(true)
      setError(null)

      const { data, error: fetchError } = await aionSupabase
        .from('bible_verses')
        .select('verse, content, book_name')
        .eq('book_id', bookId)
        .eq('chapter', Number(chapter))
        .order('verse')

      if (cancelled) return
      if (fetchError) {
        setError(fetchError.message)
        setVerses([])
      } else {
        setVerses(data ?? [])
      }
      setIsLoading(false)
    }

    fetchVerses()

    return () => {
      cancelled = true
    }
  }, [bookId, chapter, retryCount])

  const refetch = () => setRetryCount((c) => c + 1)

  return { verses, isLoading, error, refetch }
}
