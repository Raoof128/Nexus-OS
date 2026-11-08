import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { getProviderBadge } from '../../../lib/emailConfig'
import { DURATION, SPRING, TRANSITION_FADE, TRANSITION_FAST } from '../../../lib/motion'
import { useFocusTrap } from '../../../hooks/useFocusTrap'

const MODAL_VARIANTS = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING.soft },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: TRANSITION_FAST },
}

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_FADE },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}

const rowClass = 'flex items-center gap-2 px-3 py-1.5'
const labelClass = 'w-14 shrink-0 text-[12px] text-foreground'

function ComposeModal({
  isOpen,
  onClose,
  accounts = [],
  replyTo = null,
  onSend,
  onReply,
  onForward,
  onAiDraft,
  isSending = false,
  sendError = null,
}) {
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? '')
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const toRef = useRef(null)

  const isReply = replyTo?.type === 'reply'
  const isForward = replyTo?.type === 'forward'

  const title = isReply ? 'Reply' : isForward ? 'Forward' : 'New message'

  // Focus trap
  const modalRef = useFocusTrap(isOpen)

  // Scroll lock
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (isReply && replyTo.email) {
      setTo(replyTo.email.from_address || '')
      setSubject(`Re: ${replyTo.email.subject || ''}`)
      setBody('')
    } else if (isForward && replyTo.email) {
      setTo('')
      setSubject(`Fwd: ${replyTo.email.subject || ''}`)
      setBody(
        `\n\n---------- Forwarded message ----------\nFrom: ${replyTo.email.from_address || ''}\nSubject: ${replyTo.email.subject || ''}\n\n${replyTo.email.body_text || replyTo.email.snippet || ''}`,
      )
    } else {
      setTo('')
      setSubject('')
      setBody('')
    }
    if (accounts.length > 0) setSelectedAccountId(accounts[0].id)
  }, [isOpen, isReply, isForward, replyTo, accounts])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => toRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      // Don't submit without a chosen account — the button should already be
      // disabled, but guard here so a misconfigured parent can't slip through.
      if (!selectedAccountId) return
      const data = { accountId: selectedAccountId, to, cc, subject, body }
      try {
        if (isReply && replyTo?.email?.id) {
          await onReply?.({ emailId: replyTo.email.id, data })
        } else if (isForward && replyTo?.email?.id) {
          await onForward?.({ emailId: replyTo.email.id, data })
        } else {
          await onSend?.(data)
        }
        onClose?.()
      } catch {
        // errors surface via sendError prop
      }
    },
    [
      selectedAccountId,
      to,
      cc,
      subject,
      body,
      isReply,
      isForward,
      replyTo,
      onReply,
      onForward,
      onSend,
      onClose,
    ],
  )

  const handleAiDraft = useCallback(async () => {
    setIsDrafting(true)
    setDraftError(null)
    try {
      const result = await onAiDraft?.({
        accountId: selectedAccountId,
        replyTo: replyTo?.email,
        subject,
        to,
      })
      if (result?.draft) setBody(result.draft)
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setIsDrafting(false)
    }
  }, [onAiDraft, selectedAccountId, replyTo, subject, to])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose?.()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e)
    },
    [onClose, handleSubmit],
  )

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <Motion.div
            key="compose-overlay"
            variants={OVERLAY_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-[1000] bg-black/20"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Centering wrapper. role="dialog" sits here, not on .window (7.css hides .window[role=dialog]). */}
          <div className="fixed inset-0 z-[1001] flex items-end justify-center p-0 sm:items-center sm:p-6">
            <Motion.div
              key="compose-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="compose-dialog-title"
              variants={MODAL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onKeyDown={handleKeyDown}
              className="flex w-full max-w-[600px] flex-col"
              style={{ maxHeight: '100dvh' }}
            >
              <div
                ref={modalRef}
                className="window glass active is-bright flex min-h-0 w-full flex-col"
              >
                {/* Title bar */}
                <div className="title-bar">
                  <div id="compose-dialog-title" className="title-bar-text">
                    {title}
                  </div>
                  <div className="title-bar-controls">
                    <button
                      type="button"
                      className="is-close"
                      aria-label="Close"
                      onClick={onClose}
                    />
                  </div>
                </div>

                {/* Form */}
                <form
                  onSubmit={handleSubmit}
                  className="window-body has-space flex min-h-0 flex-1 flex-col"
                >
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                    {/* From */}
                    {accounts.length > 0 && (
                      <div className={rowClass}>
                        <label htmlFor="compose-from" className={labelClass}>
                          From
                        </label>
                        <select
                          id="compose-from"
                          value={selectedAccountId}
                          onChange={(e) => setSelectedAccountId(e.target.value)}
                          className="min-w-0 flex-1"
                        >
                          {accounts.map((account) => {
                            const badge = getProviderBadge(account.provider)
                            return (
                              <option key={account.id} value={account.id}>
                                {badge.label} — {account.email}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )}

                    {/* To */}
                    <div className={rowClass}>
                      <label htmlFor="compose-to" className={labelClass}>
                        To
                      </label>
                      <input
                        ref={toRef}
                        id="compose-to"
                        type="email"
                        multiple
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="name@example.com"
                      />
                    </div>

                    {/* Cc */}
                    <div className={rowClass}>
                      <label htmlFor="compose-cc" className={labelClass}>
                        Cc
                      </label>
                      <input
                        id="compose-cc"
                        type="text"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="name@example.com"
                      />
                    </div>

                    {/* Subject */}
                    <div className={rowClass}>
                      <label htmlFor="compose-subject" className={labelClass}>
                        Subject
                      </label>
                      <input
                        id="compose-subject"
                        type="text"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="min-w-0 flex-1"
                        placeholder="Add a subject"
                      />
                    </div>

                    {/* Body */}
                    <div className="flex min-h-0 flex-1 px-3 pb-3 pt-2">
                      <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={8}
                        className="min-h-[160px] w-full flex-1 resize-none text-[13px] leading-6 sm:min-h-[220px]"
                        placeholder="Write your message"
                        aria-label="Email body"
                      />
                    </div>
                  </div>

                  {/* Error */}
                  {(sendError || draftError) && (
                    <p role="alert" className="w7-error px-3 pb-2 text-[12px]">
                      {sendError
                        ? `Message not sent. ${sendError}`
                        : `Couldn't draft a reply. ${draftError}`}
                    </p>
                  )}

                  {/* Command area */}
                  <footer className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {(isReply || isForward) && onAiDraft && (
                        <button
                          type="button"
                          onClick={handleAiDraft}
                          disabled={isDrafting || isSending}
                          className="w7-btn"
                        >
                          {isDrafting ? (
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Sparkles size={14} aria-hidden="true" />
                          )}
                          {isDrafting ? 'Drafting…' : 'AI draft'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSending || isDrafting}
                        className="w7-btn default"
                      >
                        {isSending ? (
                          <>
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            Sending…
                          </>
                        ) : (
                          'Send'
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={isSending}
                        className="w7-btn"
                      >
                        Discard
                      </button>
                    </div>
                  </footer>
                </form>
              </div>
            </Motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}

export default ComposeModal
