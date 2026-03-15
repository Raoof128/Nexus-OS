import { motion as Motion } from 'framer-motion'
import { BookOpen, ChevronRight, Film, Sparkles, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

const TYPE_ICONS = {
  book: BookOpen,
  movie: Film,
  anime: Sparkles,
}

function nextStatus(current, mediaType) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || ['To Read', 'Reading', 'Finished']
  const index = statuses.indexOf(current)
  if (index === -1 || index >= statuses.length - 1) return null
  return statuses[index + 1]
}

export default function CyberCard({ item, onUpdate, onDelete, onSelect }) {
  const mediaType = item.type || 'book'
  const Icon = TYPE_ICONS[mediaType] || BookOpen
  const next = nextStatus(item.status, mediaType)

  const handleAdvance = async (event) => {
    event.stopPropagation()
    if (!next || !onUpdate) return
    await onUpdate({ mediaId: item.id, data: { status: next } })
  }

  const handleDelete = async (event) => {
    event.stopPropagation()
    if (!onDelete) return
    await onDelete(item.id)
  }

  return (
    <Motion.div
      layoutId={`card-${item.id}`}
      onClick={() => onSelect?.(item)}
      whileHover={{ y: -4, scale: 1.015 }}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/40 p-4 backdrop-blur-xl transition-all sm:p-6"
    >
      {/* Neon glowing artifact behind */}
      <div className="absolute -inset-1 z-0 bg-gradient-to-r from-primary/20 via-transparent to-primary/5 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex flex-col h-full">
        <div className="flex justify-between items-start mb-3">
          <Icon className="h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] sm:h-6 sm:w-6" />
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-medium text-primary sm:text-xs">
            {item.status}
          </span>
        </div>

        <Motion.h3
          layoutId={`title-${item.id}`}
          className="mb-1 text-base font-bold tracking-tight text-white group-hover:text-primary transition-colors sm:text-lg lg:text-xl"
        >
          {item.title}
        </Motion.h3>
        <p className="font-mono text-xs text-muted-foreground mb-3 sm:text-sm">
          // {item.creator}
        </p>

        <div className="mt-auto pt-3 border-t border-white/5 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {item.genre && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-gray-300 ring-1 ring-inset ring-white/10 sm:px-2 sm:py-1 sm:text-xs">
              {item.genre}
            </span>
          )}
          {item.rating && (
            <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-yellow-500 ring-1 ring-inset ring-white/10 sm:px-2 sm:py-1 sm:text-xs">
              ★ {item.rating}/5
            </span>
          )}

          <div className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {next && (
              <button
                type="button"
                onClick={handleAdvance}
                className="rounded-md bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary sm:p-1.5"
                title={`Move to ${next}`}
                aria-label={`Move to ${next}`}
              >
                <ChevronRight size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive sm:p-1.5"
              title="Delete"
              aria-label="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </Motion.div>
  )
}
