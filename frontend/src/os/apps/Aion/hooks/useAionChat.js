import { useState, useCallback, useRef, useEffect } from 'react'

const AION_URL = (import.meta.env.VITE_AION_SUPABASE_URL ?? '').replace(/\/$/, '')
const AION_KEY = import.meta.env.VITE_AION_SUPABASE_ANON_KEY ?? ''

export function useAionChat(session) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const abortRef = useRef(null)

  const sendMessage = useCallback(
    async (text, convId = null) => {
      if (!session) return

      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      const uid = Date.now()
      const userMsg = { id: `u-${uid}`, role: 'user', content: text, verses: [] }
      const assistantId = `a-${uid}`
      const assistantMsg = { id: assistantId, role: 'assistant', content: '', verses: [] }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setIsStreaming(true)
      setError(null)

      try {
        const response = await fetch(`${AION_URL}/functions/v1/chat`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: AION_KEY,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({
            message: text.trim(),
            conversation_id: convId ?? conversationId,
          }),
          signal: abortRef.current.signal,
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6))
                switch (currentEvent) {
                  case 'text':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, content: m.content + data.content } : m,
                      ),
                    )
                    break
                  case 'verses':
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId ? { ...m, verses: data.verses } : m,
                      ),
                    )
                    break
                  case 'conversation':
                    setConversationId(data.id)
                    break
                  case 'error':
                    setError(data.message)
                    break
                  // Unknown events are silently ignored
                }
              } catch {
                // Skip malformed SSE data
              }
              currentEvent = ''
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setIsStreaming(false)
      }
    },
    [session, conversationId],
  )

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
    setMessages([])
    setIsStreaming(false)
    setError(null)
    setConversationId(null)
  }, [])

  // Cancel in-flight request on unmount
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return { messages, sendMessage, isStreaming, error, conversationId, reset }
}
