import React, { useCallback, useEffect, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { DURATION } from '../../../lib/motion'
import DOMPurify from 'dompurify'
import { AlertTriangle, Loader2, Inbox } from 'lucide-react'
import { apiFetch } from '../../../lib/apiClient'

import EmailToolbar from './EmailToolbar'

function buildSrcdoc(html, allowImages) {
  const csp = allowImages
    ? ''
    : `<meta http-equiv="Content-Security-Policy" content="img-src 'none' data:;">`

  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ['style'],
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  })

  return `<!DOCTYPE html>
<html>
<head>
${csp}
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px 16px;
    font-family: 'Segoe UI', 'SegoeUI', 'Noto Sans', sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: #1e1e1e;
    background: #fff;
    word-break: break-word;
  }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  pre, code { font-family: Consolas, monospace; overflow-x: auto; }
  blockquote {
    margin: 12px 0;
    padding-left: 12px;
    border-left: 2px solid #99d1ff;
    color: #5c5c5c;
  }
  hr { border: none; border-top: 1px solid #d9d9d9; margin: 16px 0; }
</style>
</head>
<body>${sanitized}</body>
</html>`
}

const EmailReader = React.memo(function EmailReader({
  email,
  onReply,
  onArchive,
  onTrash,
  onToggleRead,
}) {
  const emailId = email?.id ?? null
  // The loaded body is stored with the id it belongs to. A body only renders
  // for the message it was fetched for, so reselecting a message never shows
  // the snippet while its body loads, and a late response for an earlier
  // selection never sits under the current header.
  const [loaded, setLoaded] = useState(null) // { emailId, html, error }
  // Remote images are allowed per message and reset when another is selected.
  const [imagesFor, setImagesFor] = useState(null)

  useEffect(() => {
    if (!emailId) return undefined
    let ignore = false
    apiFetch(`/api/email/${emailId}/html`)
      .then((data) => {
        if (!ignore) setLoaded({ emailId, html: data?.html ?? null, error: null })
      })
      .catch((err) => {
        if (!ignore) setLoaded({ emailId, html: null, error: err.message })
      })
    return () => {
      ignore = true
    }
  }, [emailId])

  const current = loaded && loaded.emailId === emailId ? loaded : null
  const htmlContent = current?.html ?? null
  const htmlError = current?.error ?? null
  const htmlLoading = emailId !== null && current === null
  const allowImages = emailId !== null && imagesFor === emailId

  const toggleImages = useCallback(
    () => setImagesFor((value) => (value === emailId ? null : emailId)),
    [emailId],
  )

  // Empty state
  if (!email) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-white p-8 text-center">
        <Inbox size={32} className="text-muted-foreground" aria-hidden="true" />
        <p className="text-[12px] text-muted-foreground">Select a message to read it.</p>
      </div>
    )
  }

  const srcdoc = htmlContent ? buildSrcdoc(htmlContent, allowImages) : null
  const fallbackText = email.body_text || email.snippet || ''

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <EmailToolbar
        email={email}
        onReply={onReply}
        onArchive={onArchive}
        onTrash={onTrash}
        onToggleRead={onToggleRead}
      />

      {/* Email header */}
      <AnimatePresence mode="wait">
        <Motion.div
          key={email.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: DURATION.base }}
          className="border-b border-border px-4 pb-3 pt-3"
        >
          <h2 className="w7-heading mb-2 break-words">{email.subject || '(no subject)'}</h2>
          <dl className="space-y-0.5 text-[12px]">
            <div className="flex gap-2">
              <dt className="w-12 shrink-0 text-muted-foreground">From</dt>
              <dd className="min-w-0 truncate text-foreground">
                {email.from_name && <span className="font-semibold">{email.from_name} </span>}
                <span className="text-muted-foreground">
                  &lt;{email.from_address || 'unknown'}&gt;
                </span>
              </dd>
            </div>
            {email.to_addresses?.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-muted-foreground">To</dt>
                <dd className="min-w-0 truncate text-muted-foreground">
                  {email.to_addresses.map((a) => a.email || a.name).join(', ')}
                </dd>
              </div>
            )}
            {email.provider_date && (
              <div className="flex gap-2">
                <dt className="w-12 shrink-0 text-muted-foreground">Date</dt>
                <dd className="tabular-nums text-muted-foreground">
                  {new Date(email.provider_date).toLocaleString('en-AU', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </dd>
              </div>
            )}
          </dl>
        </Motion.div>
      </AnimatePresence>

      {/* Remote image notice */}
      {htmlContent && (
        <div className="w7-infobar mx-3 mt-2 justify-between">
          <span>
            {allowImages
              ? 'Remote images are shown.'
              : 'Remote images are hidden to protect your privacy.'}
          </span>
          <button type="button" onClick={toggleImages} className="w7-btn">
            {allowImages ? 'Hide images' : 'Show images'}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {htmlLoading && (
          <div
            className="flex h-full items-center justify-center gap-2 text-[12px] text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            Loading…
          </div>
        )}

        {!htmlLoading && htmlError && (
          <p role="alert" className="w7-error flex items-center gap-2 p-4 text-[12px]">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>This message couldn&apos;t be loaded. {htmlError}</span>
          </p>
        )}

        {!htmlLoading && srcdoc && (
          // No allow-same-origin: the message HTML gets an opaque origin, so it
          // cannot reach the app's cookies, storage or DOM. Nothing here reads
          // the frame's document (no auto-height), so the sandbox costs nothing.
          <iframe
            key={`${email.id}-${allowImages}`}
            srcDoc={srcdoc}
            sandbox="allow-popups"
            title="Email body"
            className="h-full w-full border-0 bg-white"
            aria-label="Email content"
          />
        )}

        {!htmlLoading && !srcdoc && !htmlError && fallbackText && (
          <div className="h-full overflow-y-auto bg-white p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-6 text-foreground">
              {fallbackText}
            </pre>
          </div>
        )}

        {!htmlLoading && !srcdoc && !htmlError && !fallbackText && (
          <div className="flex h-full items-center justify-center p-8">
            <p className="text-[12px] text-muted-foreground">This message has no content.</p>
          </div>
        )}
      </div>
    </div>
  )
})

export default EmailReader
