import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2, Sparkles } from 'lucide-react'
import { getProviderBadge } from '../../../lib/emailConfig'
import { DURATION, SPRING, TRANSITION_FADE, TRANSITION_FAST } from '../../../lib/motion'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

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

const EMPTY_FIELDS = { to: '', cc: '', subject: '', body: '' }

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
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const toRef = useRef(null)
  // Field values as they were when the window opened (a reply pre-fills To and
  // Subject). Anything the user has changed since then counts as unsaved.
  const baselineRef = useRef(EMPTY_FIELDS)

  const isReply = replyTo?.type === 'reply'
  const isForward = replyTo?.type === 'forward'
  // Depend on the default sender's id, not the accounts array. useEmailAccounts
  // returns a new [] on every render while loading, and resetting on that would
  // wipe whatever the user has typed.
  const defaultAccountId = accounts[0]?.id ?? ''

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
    let next = EMPTY_FIELDS
    if (isReply && replyTo.email) {
      next = {
        to: replyTo.email.from_address || '',
        cc: '',
        subject: `Re: ${replyTo.email.subject || ''}`,
        body: '',
      }
    } else if (isForward && replyTo.email) {
      next = {
        to: '',
        cc: '',
        subject: `Fwd: ${replyTo.email.subject || ''}`,
        body: `\n\n---------- Forwarded message ----------\nFrom: ${replyTo.email.from_address || ''}\nSubject: ${replyTo.email.subject || ''}\n\n${replyTo.email.body_text || replyTo.email.snippet || ''}`,
      }
    }
    baselineRef.current = next
    setTo(next.to)
    setCc('')
    setSubject(next.subject)
    setBody(next.body)
    if (defaultAccountId) setSelectedAccountId(defaultAccountId)
  }, [isOpen, isReply, isForward, replyTo, defaultAccountId])

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
      // The backend contract is { email_id, instruction } (AIDraftRequest,
      // extra keys rejected). The button only shows for reply/forward.
      if (!replyTo?.email?.id) return
      const result = await onAiDraft?.({ email_id: replyTo.email.id, instruction: '' })
      if (result?.draft) setBody(result.draft)
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setIsDrafting(false)
    }
  }, [onAiDraft, replyTo])

  const hasUnsavedContent = [
    [to, baselineRef.current.to],
    [cc, baselineRef.current.cc],
    [subject, baselineRef.current.subject],
    [body, baselineRef.current.body],
  ].some(([value, initial]) => value.trim() !== initial.trim())

  // Escape, the caption close button, the backdrop and Discard all come here.
  // Typed content asks first (Windows message box, Cancel keeps the message).
  const requestClose = useCallback(() => {
    if (hasUnsavedContent && !isSending) {
      setConfirmDiscard(true)
      return
    }
    onClose?.()
  }, [hasUnsavedContent, isSending, onClose])

  const cancelDiscard = useCallback(() => setConfirmDiscard(false), [])

  const confirmDiscardAndClose = useCallback(() => {
    setConfirmDiscard(false)
    onClose?.()
  }, [onClose])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') requestClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit(e)
    },
    [requestClose, handleSubmit],
  )

  return (
    <>
      {createPortal(
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
                onClick={requestClose}
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
                          onClick={requestClose}
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
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
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
                            onClick={requestClose}
                            disabled={isSending}
                            className="w7-btn"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </Motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.getElementById('modal-root') || document.body,
      )}

      {/* Sits outside the compose dialog so its keys do not reach the compose handler. */}
      <ConfirmDialog
        open={confirmDiscard}
        id="compose-discard"
        defaultAction="cancel"
        title={title}
        message="Do you want to discard this message?"
        confirmLabel="Discard"
        variant="destructive"
        onConfirm={confirmDiscardAndClose}
        onCancel={cancelDiscard}
      />
    </>
  )
}

export default ComposeModal
