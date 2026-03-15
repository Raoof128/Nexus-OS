import { useEffect } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { BookOpen, ChevronRight, Film, Sparkles, Star, Trash2, X } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

const TYPE_ICONS = { book: BookOpen, movie: Film, anime: Sparkles }

function sanitize(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function nextStatus(current, mediaType) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || []
  const index = statuses.indexOf(current)
  if (index === -1 || index >= statuses.length - 1) return null
  return statuses[index + 1]
}

export default function MediaDetailModal({ item, onClose, onUpdate, onDelete }) {
  const mediaType = item?.type || 'book'
  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType] || BookOpen
  const next = item ? nextStatus(item.status, mediaType) : null

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleAdvance = async () => {
    if (!next || !onUpdate || !item) return
    await onUpdate({ mediaId: item.id, data: { status: next } })
    onClose()
  }

  const handleDelete = async () => {
    if (!onDelete || !item) return
    await onDelete(item.id)
    onClose()
  }

  return (
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
              layoutId={`card-${item.id}`}
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_0_60px_rgba(56,189,248,0.08)] backdrop-blur-2xl"
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              {/* Neon top border */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_15px_var(--color-primary)]" />

              {/* Header */}
              <div className="flex items-start justify-between p-6 pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-primary/70">
                      {config?.label || 'Media'} // Deep Dive
                    </p>
                    <Motion.h2
                      layoutId={`title-${item.id}`}
                      className="text-xl font-bold tracking-tight text-white sm:text-2xl"
                    >
                      {sanitize(item.title)}
                    </Motion.h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
                  aria-label="Close detail view"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4 p-6">
                {/* Creator + Status row */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-medium text-primary">
                    {item.status}
                  </span>
                  {item.creator && item.creator !== '—' && (
                    <span className="font-mono text-sm text-muted-foreground">
                      {config?.creatorLabel}: {sanitize(item.creator)}
                    </span>
                  )}
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {item.genre && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Genre</p>
                      <p className="text-sm font-medium text-white">{sanitize(item.genre)}</p>
                    </div>
                  )}
                  {item.rating && (
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
                      <p className="text-sm font-medium text-white">{sanitize(item.sub_info)}</p>
                    </div>
                  )}
                </div>

                {/* Takeaway */}
                {item.takeaway && (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Takeaway // Notes
                    </p>
                    <div className="max-h-32 overflow-y-auto custom-scrollbar pr-2 text-sm leading-relaxed text-neutral-300">
                      {sanitize(item.takeaway)}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 border-t border-white/5 pt-4">
                  {next && (
                    <button
                      type="button"
                      onClick={handleAdvance}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_15px_var(--color-primary)]"
                    >
                      <ChevronRight size={14} />
                      Move to {next}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20"
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
        </>
      )}
    </AnimatePresence>
  )
}
