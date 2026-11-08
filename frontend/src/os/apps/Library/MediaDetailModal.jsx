import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../../lib/mediaConfig'
import { SPRING, TRANSITION_FADE } from '../../../lib/motion'
import { lockScroll } from '../../../lib/scrollLock'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'

export default function MediaDetailModal({ item, onClose, onUpdate, onDelete, onEdit }) {
  const mediaType = item?.type || 'book'
  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType]
  const statusNav = item ? getStatusNav(mediaType, item.status) : null
  const trapRef = useFocusTrap(!!item)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset confirmDelete when the modal opens with a different item so a
  // cancelled confirmation never auto-fires on reopen. Using a ref + in-render
  // state update (React's "previous value" pattern) avoids a useEffect setState.
  const prevItemIdRef = useRef(item?.id)
  if (prevItemIdRef.current !== item?.id) {
    prevItemIdRef.current = item?.id
    if (confirmDelete) setConfirmDelete(false)
  }

  useEffect(() => {
    if (!item) return
    const unlock = lockScroll()
    const handleEsc = (e) => {
      // Escape belongs to the nested Delete confirmation while it is open.
      if (e.key === 'Escape' && !confirmDelete) onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      unlock()
      document.removeEventListener('keydown', handleEsc)
    }
  }, [item, onClose, confirmDelete])

  const handleStatusChange = (newStatus) => {
    if (!newStatus || !onUpdate || !item || newStatus === item.status) return
    onUpdate({ mediaId: item.id, data: { status: newStatus } })
    // Keep modal open so the user sees the stepper advance.
  }

  const handleDelete = () => {
    if (!onDelete || !item) return
    onDelete(item.id)
    setConfirmDelete(false)
    onClose()
  }

  const showGenre = item?.type !== 'job' && !!item?.genre
  const showRating = item?.type !== 'job' && item?.rating != null && item.rating > 0
  const showSubInfo = !!item?.sub_info
  const showDetails = showGenre || showRating || showSubInfo

  return createPortal(
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop: click outside the window to close */}
          <Motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION_FADE}
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/20 p-4 sm:p-6"
            onClick={onClose}
          >
            {/* role="dialog" sits on a wrapper: 7.css hides .window[role=dialog] */}
            <Motion.div
              ref={trapRef}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={SPRING.soft}
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-modal-title"
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[90dvh] w-full max-w-[460px] flex-col"
            >
              <div className="window glass active is-bright flex min-h-0 flex-1 flex-col">
                <div className="title-bar">
                  <div className="title-bar-text">{config?.singular || 'Entry'} details</div>
                  <div className="title-bar-controls">
                    <button
                      type="button"
                      className="is-close"
                      aria-label="Close"
                      onClick={onClose}
                    />
                  </div>
                </div>

                <div className="window-body has-space min-h-0 flex-1 overflow-y-auto">
                  {/* Heading */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[3px] border border-border bg-w7-pane">
                      <Icon className="h-5 w-5 text-[#3d5a80]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 id="detail-modal-title" className="w7-heading break-words">
                        {item.title}
                      </h2>
                      {item.creator && item.creator !== '—' && (
                        <p className="text-[12px] text-muted-foreground">
                          {config?.creatorLabel}: {item.creator}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status stepper */}
                  {statusNav && (
                    <fieldset className="mt-3">
                      <legend>Status</legend>
                      <div className="flex items-center overflow-x-auto py-1">
                        {statusNav.flow.map((stepStatus, index) => {
                          const isCurrent = index === statusNav.currentIndex
                          const isPast = index < statusNav.currentIndex

                          return (
                            <div
                              key={stepStatus}
                              className="flex flex-1 items-center last:flex-none"
                            >
                              <button
                                type="button"
                                onClick={() => handleStatusChange(stepStatus)}
                                disabled={isCurrent}
                                aria-current={isCurrent ? 'step' : undefined}
                                aria-label={
                                  isCurrent
                                    ? `Current status: ${stepStatus}`
                                    : `Change status to ${stepStatus}`
                                }
                                className="w7-toolbtn shrink-0 gap-1.5 px-1.5 disabled:text-w7-title disabled:opacity-100"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`h-2.5 w-2.5 rounded-full border ${
                                    isCurrent
                                      ? 'border-w7-title bg-w7-title'
                                      : isPast
                                        ? 'border-w7-select-border bg-w7-select-border'
                                        : 'border-[#828790] bg-white'
                                  }`}
                                />
                                <span className={isCurrent ? 'font-semibold' : undefined}>
                                  {stepStatus}
                                </span>
                              </button>
                              {index < statusNav.flow.length - 1 && (
                                <span
                                  aria-hidden="true"
                                  className={`mx-1 h-px min-w-3 flex-1 ${
                                    isPast ? 'bg-w7-select-border' : 'bg-border'
                                  }`}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </fieldset>
                  )}

                  {/* Details */}
                  {showDetails && (
                    <fieldset className="mt-3">
                      <legend>Details</legend>
                      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[12px]">
                        {showGenre && (
                          <>
                            <dt className="text-muted-foreground">Genre</dt>
                            <dd className="text-foreground">{item.genre}</dd>
                          </>
                        )}
                        {showRating && (
                          <>
                            <dt className="text-muted-foreground">Rating</dt>
                            <dd className="flex items-center gap-0.5">
                              <span className="sr-only">{item.rating} of 5</span>
                              {Array.from({ length: 5 }, (_, i) => (
                                <Star
                                  key={i}
                                  size={14}
                                  aria-hidden="true"
                                  className={
                                    i < item.rating
                                      ? 'fill-amber-500 text-amber-500'
                                      : 'text-[#c5cad3]'
                                  }
                                />
                              ))}
                            </dd>
                          </>
                        )}
                        {showSubInfo && (
                          <>
                            <dt className="text-muted-foreground">
                              {config?.subInfoLabel || 'Info'}
                            </dt>
                            <dd className="truncate text-foreground">{item.sub_info}</dd>
                          </>
                        )}
                      </dl>
                    </fieldset>
                  )}

                  {/* Takeaway */}
                  {item.takeaway && (
                    <fieldset className="mt-3">
                      <legend>Takeaway</legend>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                        {item.takeaway}
                      </p>
                    </fieldset>
                  )}
                </div>

                <footer className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="w7-btn mr-auto"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      requestAnimationFrame(() => onEdit?.(item))
                    }}
                    className="w7-btn default"
                  >
                    Edit
                  </button>
                </footer>
              </div>
            </Motion.div>
          </Motion.div>

          <ConfirmDialog
            open={confirmDelete}
            id={item.id}
            title="Delete entry"
            message="This action cannot be undone. Are you sure you want to delete this entry?"
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body,
  )
}
