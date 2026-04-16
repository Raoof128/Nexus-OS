import { memo, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { TYPE_ICONS, getStatusNav } from '../../lib/mediaConfig'
import { SPRING } from '../../lib/motion'
import ConfirmDialog from './ConfirmDialog'

function CyberCard({ item, onUpdate, onDelete, onSelect, onEdit }) {
  const mediaType = item.type || 'book'
  const Icon = TYPE_ICONS[mediaType]
  const { prev, next } = getStatusNav(mediaType, item.status)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleAdvance = (event) => {
    event.stopPropagation()
    if (!next || !onUpdate) return
    onUpdate({ mediaId: item.id, data: { status: next } })
  }

  const handleRevert = (event) => {
    event.stopPropagation()
    if (!prev || !onUpdate) return
    onUpdate({ mediaId: item.id, data: { status: prev } })
  }

  const handleEdit = (event) => {
    event.stopPropagation()
    if (!onEdit) return
    onEdit(item)
  }

  const handleDeleteClick = (event) => {
    event.stopPropagation()
    if (!onDelete) return
    setConfirmDelete(true)
  }

  const handleDeleteConfirm = () => {
    if (!onDelete) return
    onDelete(item.id)
    setConfirmDelete(false)
  }

  const handleCardClick = (event) => {
    // Only open detail modal if the click was directly on the card,
    // not on any button or interactive element inside it
    if (event.target.closest('button')) return
    onSelect?.(item)
  }

  return (
    <Motion.div
      onClick={handleCardClick}
      layoutId={`card-${item.id}`}
      layout="position"
      transition={SPRING.soft}
      className="neon-border group relative cursor-pointer overflow-hidden rounded-xl glass-panel p-4 hover:brightness-110 hover:shadow-[0_0_20px_hsl(var(--neon-yellow)/0.15)] sm:p-6 transition-all duration-200"
    >
      {/* Neon glowing artifact behind */}
      <div className="absolute -inset-1 z-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/5 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-3">
          <Icon className="h-5 w-5 text-primary drop-shadow-[0_0_8px_hsl(var(--neon-yellow)/0.8)] sm:h-6 sm:w-6" aria-hidden="true" />
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-medium text-primary sm:text-xs">
            {item.status}
          </span>
        </div>

        <h3 className="heading-ui mb-1 text-base font-bold tracking-tight text-white transition-colors group-hover:text-primary line-clamp-2 sm:text-lg">
          {item.title}
        </h3>
        {item.creator && item.creator !== '—' && (
          <p className="font-mono text-xs text-muted-foreground mb-3 sm:text-sm">
            // {item.creator}
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-white/5 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {mediaType !== 'job' && item.genre && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 sm:px-2 sm:py-1 sm:text-xs">
              {item.genre}
            </span>
          )}
          {mediaType !== 'job' && item.rating != null && item.rating > 0 && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-yellow-500 ring-1 ring-inset ring-white/10 sm:px-2 sm:py-1 sm:text-xs">
              ★ {item.rating}/5
            </span>
          )}

          <div className="ml-auto flex gap-0.5 sm:gap-1 sm:opacity-60 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            {prev && (
              <button
                type="button"
                onClick={handleRevert}
                className="rounded-md bg-white/5 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-1.5"
                title={`Back to ${prev}`}
                aria-label={`Back to ${prev}`}
              >
                <ChevronLeft size={14} />
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={handleAdvance}
                className="rounded-md bg-white/5 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-1.5"
                title={`Move to ${next}`}
                aria-label={`Move to ${next}`}
              >
                <ChevronRight size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={handleEdit}
              className="rounded-md bg-white/5 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-1.5"
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="rounded-md bg-white/5 p-2 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black sm:p-1.5"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        id={item.id}
        title="Delete Entry"
        message="This action cannot be undone. Are you sure you want to delete this entry?"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(false)}
      />
    </Motion.div>
  )
}

export default memo(CyberCard, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.status === next.item.status &&
  prev.item.title === next.item.title &&
  prev.item.creator === next.item.creator &&
  prev.item.genre === next.item.genre &&
  prev.item.rating === next.item.rating &&
  prev.item.takeaway === next.item.takeaway &&
  prev.item.sub_info === next.item.sub_info &&
  prev.item.type === next.item.type
)
