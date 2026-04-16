import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Pencil, Star, Trash2, X } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../lib/mediaConfig'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import ConfirmDialog from './ConfirmDialog'

export default function MediaDetailModal({ item, onClose, onUpdate, onDelete, onEdit }) {
  const mediaType = item?.type || 'book'
  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType]
  const statusNav = item ? getStatusNav(mediaType, item.status) : null
  const trapRef = useFocusTrap(!!item)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!item) return
    document.body.style.overflow = 'hidden'
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleEsc)
    }
  }, [item, onClose])

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

  return createPortal(
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <Motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[81] flex items-center justify-center p-4 sm:p-6">
            <Motion.div
              ref={trapRef}
              layoutId={`card-${item.id}`}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-modal-title"
              className="neon-border relative w-full max-w-lg max-h-[90dvh] overflow-y-auto custom-scrollbar rounded-2xl glass-panel shadow-[0_0_60px_rgba(243,230,0,0.08)]"
            >
              {/* Neon top border */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_var(--color-primary)]" />

              {/* Header */}
              <div className="flex items-start justify-between p-4 pb-0 sm:p-6 sm:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/70">
                      {config?.label || 'Media'} // Deep Dive
                    </p>
                    <h2 id="detail-modal-title" className="heading-display text-lg font-bold text-white sm:text-xl">
                      {item.title}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  aria-label="Close detail view"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-3 p-4 sm:space-y-4 sm:p-6">
                {/* Creator */}
                {item.creator && item.creator !== '—' && (
                  <div className="font-mono text-sm text-muted-foreground">
                    {config?.creatorLabel}: {item.creator}
                  </div>
                )}

                {/* Status Stepper */}
                {statusNav && (
                  <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 sm:px-4 overflow-x-auto">
                    {statusNav.flow.map((stepStatus, index) => {
                      const isCurrent = index === statusNav.currentIndex
                      const isPast = index < statusNav.currentIndex

                      return (
                        <div key={stepStatus} className="flex flex-1 items-center last:flex-none">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(stepStatus)}
                            disabled={isCurrent}
                            aria-label={isCurrent ? `Current status: ${stepStatus}` : `Change status to ${stepStatus}`}
                            className="relative flex flex-col items-center group outline-none disabled:cursor-default"
                          >
                            <Motion.div
                              whileHover={isCurrent ? {} : { scale: 1.3 }}
                              whileTap={isCurrent ? {} : { scale: 0.9 }}
                              className={`h-3.5 w-3.5 rotate-45 border transition-all duration-300 ${
                                isCurrent
                                  ? 'bg-primary border-primary/60 shadow-[0_0_12px_hsl(var(--neon-yellow)/0.6)]'
                                  : isPast
                                    ? 'bg-primary/30 border-primary/40'
                                    : 'bg-zinc-900 border-zinc-700 group-hover:border-primary/50 group-hover:bg-primary/10'
                              }`}
                            />
                            <span
                              className={`absolute top-6 text-center max-w-[56px] sm:max-w-[80px] truncate font-mono text-[7px] sm:text-[9px] uppercase tracking-wider transition-colors ${
                                isCurrent
                                  ? 'text-primary'
                                  : isPast
                                    ? 'text-primary/60'
                                    : 'text-zinc-600 group-hover:text-primary/50'
                              }`}
                            >
                              {stepStatus}
                            </span>
                          </button>
                          {index < statusNav.flow.length - 1 && (
                            <div className="relative mx-2 h-px flex-1 bg-zinc-800">
                              <Motion.div
                                initial={false}
                                animate={{ width: isPast ? '100%' : '0%' }}
                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                className="absolute inset-y-0 left-0 bg-primary/50 shadow-[0_0_6px_hsl(var(--neon-yellow)/0.4)]"
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Metadata grid */}
                <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:grid-cols-3 sm:gap-3">
                  {item.type !== 'job' && item.genre && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Genre</p>
                      <p className="text-sm font-medium text-white">{item.genre}</p>
                    </div>
                  )}
                  {item.type !== 'job' && item.rating != null && item.rating > 0 && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rating</p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            size={14}
                            className={i < item.rating ? 'fill-yellow-500 text-yellow-500' : 'text-white/10'}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {item.sub_info && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {config?.subInfoLabel || 'Info'}
                      </p>
                      <p className="truncate text-sm font-medium text-white">{item.sub_info}</p>
                    </div>
                  )}
                </div>

                {/* Takeaway */}
                {item.takeaway && (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Takeaway // Notes
                    </p>
                    <div className="text-sm leading-relaxed text-neutral-300">
                      {item.takeaway}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                  <button
                    type="button"
                    onClick={() => { onClose(); requestAnimationFrame(() => onEdit?.(item)) }}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>

              {/* Neon bottom border */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
            </Motion.div>
          </div>

          <ConfirmDialog
            open={confirmDelete}
            title="Delete Entry"
            message="This action cannot be undone. Are you sure you want to delete this entry?"
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      )}
    </AnimatePresence>,
    document.getElementById('modal-root') || document.body
  )
}
