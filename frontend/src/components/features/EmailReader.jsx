import React, { useCallback, useEffect, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react'
import { apiFetch } from '../../lib/apiClient'
import { formatEmailDate } from '../../lib/emailConfig'
import EmailToolbar from './EmailToolbar'

function buildSrcdoc(html, allowImages) {
  // Block remote images unless user opts in
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
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    line-height: 1.6;
    color: #e2e8f0;
    background: transparent;
    word-break: break-word;
  }
  a { color: #22d3ee; }
  img { max-width: 100%; height: auto; }
  pre, code { font-family: monospace; overflow-x: auto; }
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
  const [htmlContent, setHtmlContent] = useState(null)
  const [htmlLoading, setHtmlLoading] = useState(false)
  const [htmlError, setHtmlError] = useState(null)
  const [allowImages, setAllowImages] = useState(false)
  const lastEmailId = useRef(null)

  // Fetch HTML when email changes
  useEffect(() => {
    if (!email?.id) {
      setHtmlContent(null)
      return
    }
    if (email.id === lastEmailId.current) return

    lastEmailId.current = email.id
    setAllowImages(false)
    setHtmlError(null)
    setHtmlContent(null)
    setHtmlLoading(true)

    apiFetch(`/api/email/${email.id}/html`)
      .then((data) => {
        setHtmlContent(data?.html ?? null)
      })
      .catch((err) => {
        setHtmlError(err.message)
      })
      .finally(() => {
        setHtmlLoading(false)
      })
  }, [email?.id])

  const toggleImages = useCallback(() => setAllowImages((v) => !v), [])

  if (!email) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Select an email to read
      </div>
    )
  }

  const srcdoc = htmlContent ? buildSrcdoc(htmlContent, allowImages) : null
  const fallbackText = email.body_text || email.snippet || ''

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <EmailToolbar
        email={email}
        onReply={onReply}
        onArchive={onArchive}
        onTrash={onTrash}
        onToggleRead={onToggleRead}
      />

      {/* Email header */}
      <div className="border-b border-white/[0.06] px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold leading-tight text-white">
          {email.subject || '(no subject)'}
        </h2>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt className="w-6 shrink-0 font-medium text-white/50">From</dt>
            <dd className="truncate">
              {email.from_name
                ? `${email.from_name} <${email.from_address}>`
                : (email.from_address || 'Unknown')}
            </dd>
          </div>
          {email.to_address && (
            <div className="flex gap-2">
              <dt className="w-6 shrink-0 font-medium text-white/50">To</dt>
              <dd className="truncate">{email.to_address}</dd>
            </div>
          )}
          {email.provider_date && (
            <div className="flex gap-2">
              <dt className="w-6 shrink-0 font-medium text-white/50">Date</dt>
              <dd>
                {new Date(email.provider_date).toLocaleString('en-AU', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Image toggle banner */}
      {htmlContent && (
        <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.02] px-5 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            {allowImages ? 'Remote images are visible.' : 'Remote images are blocked.'}
          </span>
          <button
            type="button"
            onClick={toggleImages}
            className="flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary focus-visible:outline-none"
          >
            {allowImages ? <EyeOff size={11} /> : <Eye size={11} />}
            {allowImages ? 'Hide images' : 'Show remote images'}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {htmlLoading && (
          <div className="flex h-full items-center justify-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Loading email</span>
          </div>
        )}

        {!htmlLoading && htmlError && (
          <div className="flex items-center gap-2 p-5 text-xs text-red-400">
            <AlertTriangle size={14} />
            <span>Failed to load HTML body: {htmlError}</span>
          </div>
        )}

        {!htmlLoading && srcdoc && (
          <iframe
            key={`${email.id}-${allowImages}`}
            srcDoc={srcdoc}
            sandbox="allow-popups allow-same-origin"
            title="Email body"
            className="h-full w-full border-0 bg-transparent"
            aria-label="Email content"
          />
        )}

        {!htmlLoading && !srcdoc && !htmlError && fallbackText && (
          <div className="h-full overflow-y-auto custom-scrollbar p-5">
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-6 text-white/70">
              {fallbackText}
            </pre>
          </div>
        )}

        {!htmlLoading && !srcdoc && !htmlError && !fallbackText && (
          <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
            No content available
          </div>
        )}
      </div>
    </div>
  )
})

export default EmailReader
