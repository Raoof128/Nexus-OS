import { useState, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL

if (!API_URL) {
  throw new Error('Missing required environment variable: VITE_API_URL')
}

export function useBooks(session) {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchBooks = useCallback(async () => {
    if (!session?.access_token) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_URL}/books`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!response.ok) throw new Error('Failed to fetch books')
      const data = await response.json()
      setBooks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [session])

  const addBook = async (bookData) => {
    if (!session?.access_token) return null
    setError(null)
    try {
      const response = await fetch(`${API_URL}/books`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(bookData),
      })
      if (!response.ok) throw new Error('Failed to add book')
      const newBook = await response.json()
      setBooks((prev) => [...prev, newBook])
      return newBook
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  const suggestBook = async () => {
    if (!session?.access_token) return null
    setError(null)
    try {
      const response = await fetch(`${API_URL}/books/suggest`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      if (!response.ok) throw new Error('Failed to suggest book')
      return await response.json()
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  return { books, loading, error, fetchBooks, addBook, suggestBook }
}
