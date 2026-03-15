import { useMemo, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, BookOpen, Film, Search, Sparkles, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

const TYPE_ICONS = { book: BookOpen, movie: Film, anime: Sparkles }

export default function MediaVault({ items, mediaType, filterStatus, onBack, onUpdate, onDelete, onSelect }) {
  const [search, setSearch] = useState('')
  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType] || BookOpen

  const filtered = useMemo(() => {
    let result = items
    if (filterStatus) {
      result = result.filter((item) => item.status === filterStatus)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (item) =>
          (item.title || '').toLowerCase().includes(q) ||
          (item.creator || '').toLowerCase().includes(q) ||
          (item.genre || '').toLowerCase().includes(q),
      )
    }
    return result
  }, [items, filterStatus, search])

  const handleAdvance = async (event, item) => {
    event.stopPropagation()
    const statuses = config?.statuses || []
    const idx = statuses.indexOf(item.status)
    if (idx === -1 || idx >= statuses.length - 1 || !onUpdate) return
    await onUpdate({ mediaId: item.id, data: { status: statuses[idx + 1] } })
  }

  const handleDelete = async (event, item) => {
    event.stopPropagation()
    if (!onDelete) return
    await onDelete(item.id)
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft size={14} />
            Overview
          </button>
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-primary" />
            <h2 className="font-mono text-lg font-bold uppercase tracking-wider text-white">
              // {filterStatus || 'All'} — {config?.label}
            </h2>
            <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {filtered.length}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vault..."
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 font-mono text-xs text-white placeholder:text-white/20 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-white/5 bg-black/20 backdrop-blur-md">
        {/* Table header */}
        <div className="hidden border-b border-white/5 bg-white/[0.02] px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:grid sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.5fr_80px]">
          <span>Title</span>
          <span>{config?.creatorLabel || 'Creator'}</span>
          <span>Genre</span>
          <span>Status</span>
          <span>Rating</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar">
          {filtered.length === 0 && (
            <div className="p-8 text-center font-mono text-sm text-muted-foreground opacity-50">
              NO_RECORDS_FOUND
            </div>
          )}
          {filtered.map((item) => (
            <Motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => onSelect?.(item)}
              className="group cursor-pointer border-b border-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.03] sm:grid sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.5fr_80px] sm:items-center"
            >
              {/* Title */}
              <div className="mb-1 font-medium text-white transition-colors group-hover:text-primary sm:mb-0 sm:text-sm">
                {item.title}
              </div>

              {/* Creator */}
              <div className="mb-1 font-mono text-xs text-muted-foreground sm:mb-0">
                {item.creator !== '—' ? item.creator : ''}
              </div>

              {/* Genre */}
              <div className="mb-1 sm:mb-0">
                {item.genre && (
                  <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300 ring-1 ring-inset ring-white/10">
                    {item.genre}
                  </span>
                )}
              </div>

              {/* Status */}
              <div className="mb-1 sm:mb-0">
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
                  {item.status}
                </span>
              </div>

              {/* Rating */}
              <div className="mb-1 text-xs text-yellow-500 sm:mb-0">
                {item.rating ? `★ ${item.rating}` : ''}
              </div>

              {/* Actions */}
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={(e) => handleAdvance(e, item)}
                  className="rounded p-1 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                  title="Advance status"
                  aria-label="Advance status"
                >
                  <ArrowLeft size={12} className="rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, item)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </Motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
