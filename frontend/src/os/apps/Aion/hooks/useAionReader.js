import { useState, useEffect } from 'react'
import { aionSupabase } from '../lib/aionSupabase'

export function useAionReader(bookId, chapter) {
  const [verses, setVerses] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    if (!bookId || !chapter) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVerses([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    aionSupabase
      .from('bible_verses')
      .select('verse, content, book_name')
      .eq('book_id', bookId)
      .eq('chapter', Number(chapter))
      .order('verse')
      .then(({ data, error: fetchError }) => {
        if (cancelled) return
        if (fetchError) {
          setError(fetchError.message)
          setVerses([])
        } else {
          setVerses(data ?? [])
        }
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [bookId, chapter, retryCount])

  const refetch = () => setRetryCount((c) => c + 1)

  return { verses, isLoading, error, refetch }
}
