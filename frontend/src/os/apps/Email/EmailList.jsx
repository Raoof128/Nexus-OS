import React, { useCallback, useRef } from 'react'
import { motion as Motion } from 'framer-motion'
import { Star, Paperclip, Inbox, Loader2 } from 'lucide-react'
import { formatEmailDate, getProviderBadge } from '../../../lib/emailConfig'
import { DURATION } from '../../../lib/motion'

const SCROLL_THRESHOLD = 150

// Windows 7 list box: one Tab stop (roving tabindex). Up/Down, Home and End move
// focus and selection; Enter/Space open the message; S toggles the star.
// The star is a sibling of the option, not a child, because option children are
// presentational in ARIA. It stays mouse-clickable and is keyboard-reachable
// through S, so it is not a second Tab stop.
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

  const toggleStar = useCallback(
    (email) => {
      onToggleStar?.({ emailId: email.id, isStarred: !email.is_starred })
    },
    [onToggleStar],
  )

  const handleStarClick = useCallback(
    (e, email) => {
      e.stopPropagation()
      toggleStar(email)
    },
    [toggleStar],
  )

  const focusOption = useCallback(
    (index) => {
      const options = containerRef.current?.querySelectorAll('[role="option"]')
      const target = options?.[index]
      if (!target) return
      target.focus()
      target.scrollIntoView?.({ block: 'nearest' })
      const email = emails[index]
      if (email) onSelectEmail?.(email)
    },
    [emails, onSelectEmail],
  )

  const handleOptionKeyDown = useCallback(
    (e, email, index) => {
      const last = emails.length - 1
      let target
      switch (e.key) {
        case 'ArrowDown':
          target = Math.min(index + 1, last)
          break
        case 'ArrowUp':
          target = Math.max(index - 1, 0)
          break
        case 'Home':
          target = 0
          break
        case 'End':
          target = last
          break
        case 'Enter':
        case ' ':
          e.preventDefault()
          onSelectEmail?.(email)
          return
        case 's':
        case 'S':
          if (e.ctrlKey || e.metaKey || e.altKey) return
          e.preventDefault()
          toggleStar(email)
          return
        default:
          return
      }
      e.preventDefault()
      if (target !== index) focusOption(target)
    },
    [emails.length, focusOption, onSelectEmail, toggleStar],
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

  // Roving tabindex: the selected message is the single Tab stop; with no
  // selection in view, the first message is.
  const hasSelection = emails.some((email) => email.id === selectedEmailId)

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
          const isTabStop = hasSelection ? isSelected : index === 0
          const badge = showProviderBadge ? getProviderBadge(email.provider) : null
          const isUnread = !email.is_read
          const sender = email.from_name || email.from_address || 'Unknown'
          const dateText = email.provider_date ? formatEmailDate(email.provider_date) : ''
          const accessibleName = [
            isUnread ? 'Unread' : null,
            email.is_starred ? 'Starred' : null,
            badge?.label,
            sender,
            email.subject || '(no subject)',
            dateText,
            email.has_attachments ? 'Has attachments' : null,
            email.snippet || null,
          ]
            .filter(Boolean)
            .join(', ')

          return (
            <div
              key={email.id}
              role="presentation"
              className="group relative my-px flex items-stretch"
            >
              <Motion.div
                layoutId={`email-${email.id}`}
                role="option"
                tabIndex={isTabStop ? 0 : -1}
                aria-selected={isSelected}
                aria-keyshortcuts="S"
                aria-label={accessibleName}
                onClick={() => onSelectEmail?.(email)}
                onKeyDown={(e) => handleOptionKeyDown(e, email, index)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DURATION.base, delay: index < 20 ? index * 0.02 : 0 }}
                className="w7-item flex min-w-0 flex-1 cursor-default gap-2 px-2 py-1.5 text-[12px]"
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
                <div className="min-w-0 flex-1" aria-hidden="true">
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate ${isUnread ? 'font-semibold' : 'font-normal'} text-foreground`}
                    >
                      {sender}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {badge && (
                        <span className={`w7-badge shrink-0 ${badge.bgColor} ${badge.textColor}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {dateText}
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

                    {email.has_attachments && (
                      <Paperclip
                        size={12}
                        className="mt-0.5 shrink-0 text-muted-foreground"
                        aria-label="Has attachments"
                        role="img"
                      />
                    )}
                  </div>
                </div>
              </Motion.div>

              {/* Star toggle: a mouse convenience outside the option. Keyboard users press S
                  on the focused message (announced via aria-keyshortcuts and the option name),
                  so the button is hidden from assistive tech and is not a Tab stop. */}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(e) => handleStarClick(e, email)}
                className="flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-sm text-muted-foreground hover:text-amber-600 pointer-coarse:h-11 pointer-coarse:w-11"
                aria-label={email.is_starred ? 'Unstar' : 'Star'}
              >
                <Star
                  size={14}
                  aria-hidden="true"
                  className={
                    email.is_starred
                      ? 'fill-amber-600 text-amber-600'
                      : 'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100'
                  }
                />
              </button>
            </div>
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
