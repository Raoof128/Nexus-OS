import React, { useCallback, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { Star, Paperclip, Inbox, Loader2 } from 'lucide-react'
import { formatEmailDate, getProviderBadge } from '../../../lib/emailConfig'
import { DURATION } from '../../../lib/motion'

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
  searchActive = false,
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
    let message = 'No messages in this folder.'
    if (searchActive) message = 'No messages match your search.'
    else if (activeFolder === 'inbox') message = 'Your inbox is empty.'
    return (
      <div
        aria-live="polite"
        className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center"
      >
        <Inbox size={28} className="text-muted-foreground" aria-hidden="true" />
        <p className="text-[12px] text-muted-foreground">{message}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto bg-white"
      role="listbox"
      aria-label="Email messages"
    >
      <div aria-live="polite" className="p-1">
        {emails.map((email, index) => {
          const isSelected = email.id === selectedEmailId
          const badge = showProviderBadge ? getProviderBadge(email.provider) : null
          const isUnread = !email.is_read

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
              className="w7-item group relative my-px flex cursor-default gap-2 px-2 py-1.5 text-[12px]"
              aria-selected={isSelected}
            >
              {/* Unread marker */}
              <div className="mt-1.5 shrink-0" aria-hidden="true">
                {isUnread ? (
                  <span className="block h-2 w-2 rounded-full bg-primary" />
                ) : (
                  <span className="block h-2 w-2" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`truncate ${isUnread ? 'font-semibold' : 'font-normal'} text-foreground`}
                  >
                    {email.from_name || email.from_address || 'Unknown'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {badge && (
                      <span
                        className={`inline-flex items-center rounded px-1 py-px text-[10px] font-semibold ${badge.bgColor} ${badge.textColor}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {email.provider_date ? formatEmailDate(email.provider_date) : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-[12px] ${isUnread ? 'font-semibold' : 'font-normal'} text-foreground`}
                    >
                      {email.subject || '(no subject)'}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">
                      {email.snippet || ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {email.has_attachments && (
                      <Paperclip
                        size={12}
                        className="text-muted-foreground"
                        aria-label="Has attachments"
                        role="img"
                      />
                    )}

                    {/* Star toggle */}
                    <button
                      type="button"
                      onClick={(e) => handleStarClick(e, email)}
                      className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:text-amber-500"
                      aria-label={email.is_starred ? 'Unstar' : 'Star'}
                    >
                      <Star
                        size={14}
                        aria-hidden="true"
                        className={
                          email.is_starred
                            ? 'fill-amber-500 text-amber-500'
                            : 'opacity-0 transition-opacity group-hover:opacity-100'
                        }
                      />
                    </button>
                  </div>
                </div>
              </div>
            </Motion.div>
          )
        })}
      </div>

      {loading && (
        <div
          aria-live="polite"
          className="flex items-center justify-center gap-2 py-3 text-[12px] text-muted-foreground"
        >
          <Loader2 size={14} className="animate-spin text-primary" aria-hidden="true" />
          Loading…
        </div>
      )}
    </div>
  )
})

export default EmailList
