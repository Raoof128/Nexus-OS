import React, { useCallback, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { Star, Paperclip, Inbox } from 'lucide-react'
import { formatEmailDate, getProviderBadge } from '../../../lib/emailConfig'
import { DURATION, SPRING } from '../../../lib/motion'

const SCROLL_THRESHOLD = 150

const EmailList = React.memo(function EmailList({
  emails = [],
  selectedEmailId = null,
  onSelectEmail,
  onToggleStar,
  onLoadMore,
  showProviderBadge = false,
  loading = false,
  activeFolder = 'inbox',
}) {
  const containerRef = useRef(null)

  const handleScroll = useCallback(() => {
    const el = containerRef.current
    if (!el || !onLoadMore) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < SCROLL_THRESHOLD) {
      onLoadMore()
    }
  }, [onLoadMore])

  const handleStarClick = useCallback(
    (e, email) => {
      e.stopPropagation()
      onToggleStar?.({ emailId: email.id, isStarred: !email.is_starred })
    },
    [onToggleStar],
  )

  if (!loading && emails.length === 0) {
    return (
      <div
        aria-live="polite"
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <Inbox size={28} className="text-primary/20" aria-hidden="true" />
        <span className="heading-display text-[10px] tracking-[0.3em] text-muted-foreground/50">
          NO_SIGNALS_FOUND
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/30">
          {activeFolder}::empty
        </span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto custom-scrollbar"
      role="listbox"
      aria-label="Email messages"
    >
      <div aria-live="polite">
        {emails.map((email, index) => {
          const isSelected = email.id === selectedEmailId
          const badge = showProviderBadge ? getProviderBadge(email.provider) : null

          return (
            <Motion.div
              key={email.id}
              layoutId={`email-${email.id}`}
              role="option"
              tabIndex={0}
              onClick={() => onSelectEmail?.(email)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectEmail?.(email)
                }
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.base, delay: index < 20 ? index * 0.02 : 0 }}
              className={`group relative cursor-pointer border-b border-white/[0.04] px-4 py-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 ${
                isSelected ? 'bg-primary/[0.07]' : 'hover:bg-white/[0.025]'
              }`}
              aria-selected={isSelected}
            >
              {/* Selected indicator — neon left border */}
              {isSelected && (
                <Motion.div
                  layoutId="email-selected-bar"
                  className="absolute inset-y-0 left-0 w-0.5 bg-primary shadow-[0_0_8px_var(--color-primary)]"
                  transition={SPRING.soft}
                />
              )}

              <div className="flex items-start gap-3">
                {/* Unread indicator */}
                <div className="mt-1.5 shrink-0">
                  {!email.is_read ? (
                    <span className="block h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]" />
                  ) : (
                    <span className="block h-2 w-2" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate font-mono text-xs ${
                        email.is_read ? 'text-white/50' : 'font-semibold text-white'
                      }`}
                    >
                      {email.from_name || email.from_address || 'Unknown'}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {badge && (
                        <span
                          className={`inline-flex items-center rounded px-1 py-0.5 font-mono text-[8px] font-bold ring-1 ring-inset ring-white/10 ${badge.bgColor} ${badge.textColor}`}
                        >
                          {badge.label}
                        </span>
                      )}
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                        {email.provider_date ? formatEmailDate(email.provider_date) : ''}
                      </span>
                    </div>
                  </div>

                  <div className="mt-0.5 flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-xs ${
                          email.is_read ? 'text-white/40' : 'font-medium text-white/75'
                        }`}
                      >
                        {email.subject || '(no subject)'}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/40">
                        {email.snippet || ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {/* Attachment indicator */}
                      {email.has_attachments && (
                        <Paperclip size={10} className="text-muted-foreground/40" />
                      )}

                      {/* Star toggle */}
                      <button
                        type="button"
                        onClick={(e) => handleStarClick(e, email)}
                        className="rounded p-2 text-muted-foreground/40 transition-all hover:text-yellow-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        aria-label={email.is_starred ? 'Unstar' : 'Star'}
                      >
                        <Star
                          size={12}
                          className={
                            email.is_starred
                              ? 'fill-yellow-500 text-yellow-500 drop-shadow-[0_0_4px_theme(colors.yellow.500)]'
                              : 'opacity-0 group-hover:opacity-100 transition-opacity'
                          }
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Motion.div>
          )
        })}
      </div>

      {loading && (
        <div aria-live="polite" className="flex items-center justify-center gap-2 py-4">
          <span
            className="h-1 w-1 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: '0ms' }}
          />
          <span
            className="h-1 w-1 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: '150ms' }}
          />
          <span
            className="h-1 w-1 animate-bounce rounded-full bg-primary"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      )}
    </div>
  )
})

export default EmailList
