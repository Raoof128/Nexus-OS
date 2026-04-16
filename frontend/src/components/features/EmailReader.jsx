import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion as Motion, AnimatePresence } from 'framer-motion'
import { DURATION } from '../../lib/motion'
import DOMPurify from 'dompurify'
import { AlertTriangle, Eye, EyeOff, Loader2, Inbox } from 'lucide-react'
import { apiFetch } from '../../lib/apiClient'

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
    padding: 20px 24px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.7;
    color: #c4ccd8;
    background: transparent;
    word-break: break-word;
  }
  a { color: #22d3ee; text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { max-width: 100%; height: auto; border-radius: 4px; }
  pre, code { font-family: 'JetBrains Mono', monospace; overflow-x: auto; }
  blockquote {
    margin: 12px 0;
    padding-left: 12px;
    border-left: 2px solid #22d3ee30;
    color: #8890a0;
  }
  hr { border: none; border-top: 1px solid #ffffff08; margin: 16px 0; }
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

  useEffect(() => {
    if (!email?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Empty state
  if (!email) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-4 p-8">
        {/* Ambient glow */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-64 w-64 rounded-full bg-primary/[0.03] blur-[80px]" />
        </div>
        <Inbox size={32} className="text-primary/20" />
        <div className="text-center">
          <p className="heading-display text-[10px] tracking-[0.3em] text-muted-foreground/40">
            SELECT_SIGNAL
          </p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground/25">
            inbox://awaiting_selection
          </p>
        </div>
      </div>
    )
  }

  const srcdoc = htmlContent ? buildSrcdoc(htmlContent, allowImages) : null
  const fallbackText = email.body_text || email.snippet || ''

  return (
    <div className="relative flex h-full flex-col">
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
          className="border-b border-white/[0.06] px-5 py-4"
        >
          <h2 className="heading-ui mb-3 text-sm font-semibold leading-tight text-white">
            {email.subject || '(no subject)'}
          </h2>
          <dl className="space-y-1.5 font-mono text-[11px]">
            <div className="flex gap-3">
              <dt className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-primary/40">
                From
              </dt>
              <dd className="truncate text-accent">
                {email.from_name && (
                  <span className="text-white/80">{email.from_name} </span>
                )}
                <span className="text-muted-foreground">
                  &lt;{email.from_address || 'unknown'}&gt;
                </span>
              </dd>
            </div>
            {email.to_addresses?.length > 0 && (
              <div className="flex gap-3">
                <dt className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-primary/40">
                  To
                </dt>
                <dd className="truncate text-muted-foreground">
                  {email.to_addresses.map((a) => a.email || a.name).join(', ')}
                </dd>
              </div>
            )}
            {email.provider_date && (
              <div className="flex gap-3">
                <dt className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-primary/40">
                  Date
                </dt>
                <dd className="tabular-nums text-muted-foreground/60">
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

      {/* Image toggle banner */}
      {htmlContent && (
        <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.015] px-5 py-1.5">
          <span className="font-mono text-[10px] text-muted-foreground/50">
            {allowImages ? 'remote_images::visible' : 'remote_images::blocked'}
          </span>
          <button
            type="button"
            onClick={toggleImages}
            className="flex items-center gap-1.5 font-mono text-[10px] font-medium text-primary/60 transition-colors hover:text-primary focus-visible:outline-none"
          >
            {allowImages ? <EyeOff size={11} /> : <Eye size={11} />}
            {allowImages ? 'Block' : 'Allow'}
          </button>
        </div>
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {htmlLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary/60" aria-hidden="true" />
            <span className="font-mono text-[10px] text-muted-foreground/40">
              decrypting_signal...
            </span>
          </div>
        )}

        {!htmlLoading && htmlError && (
          <div className="flex items-center gap-2 p-5 font-mono text-xs text-destructive/80">
            <AlertTriangle size={14} />
            <span>signal_error: {htmlError}</span>
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
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-7 text-white/60">
              {fallbackText}
            </pre>
          </div>
        )}

        {!htmlLoading && !srcdoc && !htmlError && !fallbackText && (
          <div className="flex h-full items-center justify-center p-8">
            <span className="heading-display text-[10px] tracking-[0.3em] text-muted-foreground/30">
              NO_CONTENT
            </span>
          </div>
        )}
      </div>
    </div>
  )
})

export default EmailReader
