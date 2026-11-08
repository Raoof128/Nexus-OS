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
    // No `layoutId` here: the detail modal used to share `card-${item.id}` for
    // a morph-from-card entry, but sharing the id while both the card and the
    // modal are mounted caused Framer's layout reconciler to fight with itself
    // on optimistic status updates (card re-parented to a new column while the
    // modal was still open), which showed up as a full-modal "shake" and a
    // stalled exit animation when the close button was clicked. `layout="position"`
    // is kept so within-column drag reorder still settles smoothly.
    <Motion.div
      onClick={handleCardClick}
      layout="position"
      transition={SPRING.soft}
      className="w7-card w7-item group relative cursor-pointer p-3 @sm:p-4"
    >
      <div className="relative flex h-full flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <Icon className="h-4 w-4 shrink-0 text-[#3d5a80]" aria-hidden="true" />
          <span className="w7-badge">{item.status}</span>
        </div>

        <h3 className="line-clamp-2 text-[13px] font-semibold text-foreground">{item.title}</h3>
        {item.creator && item.creator !== '—' && (
          <p className="text-[12px] text-muted-foreground">{item.creator}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-border pt-2">
          {mediaType !== 'job' && item.genre && <span className="w7-badge">{item.genre}</span>}
          {mediaType !== 'job' && item.rating != null && item.rating > 0 && (
            <span className="text-[12px] text-[#8a5a00]">★ {item.rating}/5</span>
          )}

          <div className="ml-auto flex max-w-full flex-wrap justify-end gap-0.5">
            {prev && (
              <button
                type="button"
                onClick={handleRevert}
                className="w7-toolbtn px-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                title={`Back to ${prev}`}
                aria-label={`Back to ${prev}`}
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={handleAdvance}
                className="w7-toolbtn px-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                title={`Move to ${next}`}
                aria-label={`Move to ${next}`}
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={handleEdit}
              className="w7-toolbtn px-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              title="Edit"
              aria-label="Edit"
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleDeleteClick}
              className="w7-toolbtn w7-toolbtn--danger px-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        id={item.id}
        title="Delete entry"
        message="This action cannot be undone. Are you sure you want to delete this entry?"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(false)}
      />
    </Motion.div>
  )
}

export default memo(
  CyberCard,
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.item.status === next.item.status &&
    prev.item.title === next.item.title &&
    prev.item.creator === next.item.creator &&
    prev.item.genre === next.item.genre &&
    prev.item.rating === next.item.rating &&
    prev.item.takeaway === next.item.takeaway &&
    prev.item.sub_info === next.item.sub_info &&
    prev.item.type === next.item.type,
)
