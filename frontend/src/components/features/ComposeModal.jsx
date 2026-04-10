import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2, Sparkles, X } from 'lucide-react'
import { getProviderBadge } from '../../lib/emailConfig'

const MODAL_VARIANTS = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, y: 16, scale: 0.97, transition: { duration: 0.15 } },
}

const OVERLAY_VARIANTS = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
}

function ComposeModal({
  isOpen,
  onClose,
  accounts = [],
  replyTo = null,           // { email, type: 'reply' | 'forward' }
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

  // Pre-fill fields when replying/forwarding
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
    // Set default account when modal opens
    if (accounts.length > 0) setSelectedAccountId(accounts[0].id)
  }, [isOpen, isReply, isForward, replyTo, accounts])

  // Auto-focus To field when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => toRef.current?.focus(), 100)
    }
  }, [isOpen])

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault()
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
    [selectedAccountId, to, cc, subject, body, isReply, isForward, replyTo, onReply, onForward, onSend, onClose],
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
    },
    [onClose],
  )

  return (
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <Motion.div
            key="compose-modal"
            role="dialog"
            aria-modal="true"
            aria-label={isReply ? 'Reply' : isForward ? 'Forward' : 'New email'}
            variants={MODAL_VARIANTS}
            initial="hidden"
            animate="visible"
            exit="exit"
            onKeyDown={handleKeyDown}
            className="fixed bottom-6 right-6 z-50 flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-background shadow-2xl sm:right-8"
            style={{ maxHeight: 'calc(100vh - 3rem)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {isReply ? 'Reply' : isForward ? 'Forward' : 'New Message'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Close compose"
              >
                <X size={14} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto">
                {/* Account selector */}
                <div className="border-b border-white/[0.04] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <label className="shrink-0 text-[11px] font-medium text-muted-foreground w-12">
                      From
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="flex-1 rounded border border-white/10 bg-transparent px-2 py-1 text-xs text-white/80 focus:border-primary/40 focus:outline-none"
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
                <div className="border-b border-white/[0.04] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="compose-to" className="shrink-0 text-[11px] font-medium text-muted-foreground w-12">
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
                      className="flex-1 bg-transparent text-xs text-white placeholder-muted-foreground focus:outline-none"
                      placeholder="recipient@example.com"
                    />
                  </div>
                </div>

                {/* Cc */}
                <div className="border-b border-white/[0.04] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="compose-cc" className="shrink-0 text-[11px] font-medium text-muted-foreground w-12">
                      Cc
                    </label>
                    <input
                      id="compose-cc"
                      type="text"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      className="flex-1 bg-transparent text-xs text-white placeholder-muted-foreground focus:outline-none"
                      placeholder="cc@example.com"
                    />
                  </div>
                </div>

                {/* Subject */}
                <div className="border-b border-white/[0.04] px-4 py-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="compose-subject" className="shrink-0 text-[11px] font-medium text-muted-foreground w-12">
                      Subject
                    </label>
                    <input
                      id="compose-subject"
                      type="text"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 bg-transparent text-xs text-white placeholder-muted-foreground focus:outline-none"
                      placeholder="Subject"
                    />
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 py-3">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={10}
                    className="w-full resize-none bg-transparent text-xs leading-6 text-white/80 placeholder-muted-foreground focus:outline-none"
                    placeholder="Write your message..."
                    aria-label="Email body"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.06] px-4 py-3">
                {(sendError || draftError) && (
                  <p className="mb-2 text-[11px] text-red-400">
                    {sendError || draftError}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3">
                  {/* AI Draft — only when replying or when there's context */}
                  {(isReply || isForward) && onAiDraft && (
                    <button
                      type="button"
                      onClick={handleAiDraft}
                      disabled={isDrafting || isSending}
                      className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-40"
                    >
                      {isDrafting ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      {isDrafting ? 'Drafting...' : 'AI Draft'}
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSending}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-white disabled:pointer-events-none disabled:opacity-40"
                    >
                      Discard
                    </button>
                    <button
                      type="submit"
                      disabled={isSending || isDrafting}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_10px_var(--color-primary)] transition-all hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {isSending ? (
                        <>
                          <Loader2 size={12} className="animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </Motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ComposeModal
