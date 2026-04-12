import React, { useCallback, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { formatEmailDate, getProviderBadge } from '../../lib/emailConfig'

const SCROLL_THRESHOLD = 150

const EmailList = React.memo(function EmailList({
  emails = [],
  selectedEmailId = null,
  onSelectEmail,
  onToggleStar,
  onLoadMore,
  showProviderBadge = false,
  loading = false,
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
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No messages
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full overflow-y-auto custom-scrollbar"
      role="list"
      aria-label="Email messages"
    >
      {emails.map((email) => {
        const isSelected = email.id === selectedEmailId
        const badge = showProviderBadge ? getProviderBadge(email.provider) : null

        return (
          <Motion.div
            key={email.id}
            layoutId={`email-${email.id}`}
            role="listitem"
            onClick={() => onSelectEmail?.(email)}
            className={`relative cursor-pointer border-b border-white/[0.04] px-4 py-3 transition-all hover:bg-white/[0.03] ${
              isSelected
                ? 'bg-primary/5 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary before:content-[""]'
                : ''
            }`}
            aria-selected={isSelected}
          >
            <div className="flex items-start gap-3">
              {/* Unread indicator */}
              <div className="mt-1.5 shrink-0">
                {!email.is_read ? (
                  <span
                    className="block h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_var(--color-primary)]"
                    aria-label="Unread"
                  />
                ) : (
                  <span className="block h-2 w-2" />
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs font-semibold ${
                      email.is_read ? 'text-white/60' : 'text-white'
                    }`}
                  >
                    {email.from_name || email.from_address || 'Unknown'}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {badge && (
                      <span
                        className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-semibold ${badge.bgColor} ${badge.textColor}`}
                      >
                        {badge.label}
                      </span>
                    )}
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {email.provider_date ? formatEmailDate(email.provider_date) : ''}
                    </span>
                  </div>
                </div>

                <div className="mt-0.5 flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-xs ${
                        email.is_read ? 'text-white/50' : 'text-white/80 font-medium'
                      }`}
                    >
                      {email.subject || '(no subject)'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {email.snippet || ''}
                    </p>
                  </div>

                  {/* Star toggle */}
                  <button
                    type="button"
                    onClick={(e) => handleStarClick(e, email)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-yellow-400 focus-visible:ring-1 focus-visible:ring-primary"
                    aria-label={email.is_starred ? 'Unstar email' : 'Star email'}
                  >
                    <Star
                      size={12}
                      className={
                        email.is_starred
                          ? 'fill-yellow-400 text-yellow-400'
                          : ''
                      }
                    />
                  </button>
                </div>
              </div>
            </div>
          </Motion.div>
        )
      })}

      {loading && (
        <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
          Loading...
        </div>
      )}
    </div>
  )
})

export default EmailList
