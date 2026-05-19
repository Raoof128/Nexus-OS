import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2, Sparkles, X, Send } from 'lucide-react'
import { getProviderBadge } from '../../lib/emailConfig'
import { DURATION, SPRING, TRANSITION_FADE, TRANSITION_FAST } from '../../lib/motion'
import { useFocusTrap } from '../../hooks/useFocusTrap'

const MODAL_VARIANTS = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING.soft },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: TRANSITION_FAST },
}

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: TRANSITION_FADE },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
}

const inputClass =
  'flex-1 bg-transparent font-mono text-xs text-white/80 placeholder-muted-foreground/40 focus:outline-none'
const labelClass =
  'w-10 shrink-0 font-mono text-[9px] uppercase tracking-wider text-primary/40 sm:w-12 sm:text-[10px]'

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
            className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-md"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal centering wrapper — full-screen on mobile, centered card on desktop */}
          <div className="fixed inset-0 z-[1001] flex items-end justify-center sm:items-center sm:p-6">
            <Motion.div
              key="compose-modal"
              ref={modalRef}
              role="dialog"
              aria-modal="true"
              aria-label={isReply ? 'Reply' : isForward ? 'Forward' : 'New transmission'}
              variants={MODAL_VARIANTS}
              initial="hidden"
              animate="visible"
              exit="exit"
              onKeyDown={handleKeyDown}
              className="neon-border glass-panel flex w-full flex-col overflow-hidden rounded-t-2xl shadow-[0_0_60px_rgba(243,230,0,0.08)] sm:max-w-lg sm:rounded-2xl"
              style={{ maxHeight: '100dvh', height: 'auto' }}
            >
              {/* Neon top line */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_var(--color-primary)]" />

              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <h2 className="heading-display text-[11px] tracking-[0.15em] text-white">
                  {isReply ? '// Reply' : isForward ? '// Forward' : '// New Transmission'}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md bg-white/[0.03] p-1.5 text-muted-foreground transition-all hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Close compose"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {/* Account selector */}
                  <div className="border-b border-white/[0.04] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <label className={labelClass}>From</label>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="heading-ui flex-1 rounded border border-white/10 bg-transparent px-2 py-1 text-xs text-white/80 focus:border-primary/40 focus:outline-none"
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
                  </div>

                  {/* To */}
                  <div className="border-b border-white/[0.04] px-4 py-2.5">
                    <div className="flex items-center gap-2">
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
                        className={inputClass}
                        placeholder="target@nexus.net"
                      />
                    </div>
                  </div>

                  {/* Cc */}
                  <div className="border-b border-white/[0.04] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <label htmlFor="compose-cc" className={labelClass}>
                        Cc
                      </label>
                      <input
                        id="compose-cc"
                        type="text"
                        value={cc}
                        onChange={(e) => setCc(e.target.value)}
                        className={inputClass}
                        placeholder="cc@nexus.net"
                      />
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="border-b border-white/[0.04] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <label htmlFor="compose-subject" className={labelClass}>
                        Subj
                      </label>
                      <input
                        id="compose-subject"
                        type="text"
                        required
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className={inputClass}
                        placeholder="Signal subject"
                      />
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-4 py-3">
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={6}
                      className="heading-ui w-full min-h-[120px] flex-1 resize-none bg-transparent text-xs leading-7 text-white/70 placeholder-muted-foreground/30 focus:outline-none sm:min-h-[200px]"
                      placeholder="nexus:// compose transmission..."
                      aria-label="Email body"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="relative border-t border-white/[0.06] px-4 py-3">
                  {/* Neon bottom line */}
                  <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

                  {(sendError || draftError) && (
                    <p className="mb-2 font-mono text-[10px] text-destructive">
                      error:: {sendError || draftError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
                    {/* AI Draft */}
                    {(isReply || isForward) && onAiDraft && (
                      <button
                        type="button"
                        onClick={handleAiDraft}
                        disabled={isDrafting || isSending}
                        className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/20 transition-all hover:bg-accent/20 hover:shadow-[0_0_12px_hsl(var(--neon-yellow)/0.15)] disabled:pointer-events-none disabled:opacity-40"
                      >
                        {isDrafting ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Sparkles size={11} />
                        )}
                        {isDrafting ? 'Drafting...' : 'AI Draft'}
                      </button>
                    )}

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={isSending}
                        className="heading-ui rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-white disabled:pointer-events-none disabled:opacity-40"
                      >
                        Discard
                      </button>
                      <button
                        type="submit"
                        disabled={isSending || isDrafting}
                        className="neon-pulse flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-[0_0_10px_var(--color-primary)] transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {isSending ? (
                          <>
                            <Loader2 size={11} className="animate-spin" />
                            Transmitting...
                          </>
                        ) : (
                          <>
                            <Send size={11} />
                            Transmit
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </Motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}

export default ComposeModal
