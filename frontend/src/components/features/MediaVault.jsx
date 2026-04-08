import { memo, useMemo, useState } from 'react'
import { motion as Motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { MEDIA_CONFIG, TYPE_ICONS, getStatusNav } from '../../lib/mediaConfig'
import ConfirmDialog from './ConfirmDialog'

function MediaVault({ items, mediaType, filterStatus, onBack, onUpdate, onDelete, onSelect, onEdit }) {
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const config = MEDIA_CONFIG[mediaType]
  const Icon = TYPE_ICONS[mediaType]
  const isJob = mediaType === 'job'

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

  const handleStatusChange = (event, item, newStatus) => {
    event.stopPropagation()
    if (!newStatus || !onUpdate) return
    onUpdate({ mediaId: item.id, data: { status: newStatus } })
  }

  const handleDelete = (event, item) => {
    event.stopPropagation()
    if (!onDelete) return
    setDeleteTarget(item.id)
  }

  const confirmDeleteAction = () => {
    if (!deleteTarget || !onDelete) return
    onDelete(deleteTarget)
    setDeleteTarget(null)
  }

  return (
    <div className="mx-auto max-w-7xl p-3 sm:p-4 md:p-6 xl:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 font-mono text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <ArrowLeft size={14} />
            Overview
          </button>
          <div className="flex items-center gap-2">
            <Icon size={18} className="text-primary" />
            <h2 className="heading-display text-sm font-bold text-white sm:text-lg">
              <span aria-hidden="true">// </span>{filterStatus || 'All'} — {config?.label}
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
            aria-label="Search vault"
            className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 font-mono text-xs text-white placeholder:text-white/40 focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Table */}
      <div className="neon-border overflow-hidden rounded-xl glass-panel">
        {/* Table header */}
        <div className={`hidden border-b border-white/5 bg-white/[0.02] px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground sm:grid ${isJob ? 'sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_80px]' : 'sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.5fr_80px]'}`}>
          <span>Title</span>
          <span>{config?.creatorLabel || 'Creator'}</span>
          {!isJob && <span>Genre</span>}
          <span>Status</span>
          {!isJob && <span>Rating</span>}
          <span>{isJob ? (config?.subInfoLabel || 'Info') : ''}</span>
        </div>

        {/* Rows */}
        <div className="max-h-[calc(100dvh-14rem)] sm:max-h-[calc(100dvh-16rem)] overflow-y-auto custom-scrollbar">
          {filtered.length === 0 && (
            <div className="border border-dashed border-white/10 rounded-xl p-8 text-center opacity-50">
              <p className="font-mono text-xs tracking-wide sm:text-sm">NO_RECORDS_FOUND</p>
            </div>
          )}
          {filtered.map((item) => (
            <Motion.div
              key={item.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => onSelect?.(item)}
              className={`group cursor-pointer border-b border-white/[0.03] px-4 py-3 transition-colors hover:bg-white/[0.03] sm:grid ${isJob ? 'sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_80px]' : 'sm:grid-cols-[2fr_1.5fr_1fr_0.8fr_0.5fr_80px]'} sm:items-center`}
            >
              {/* Title */}
              <div className="mb-1 font-medium text-white transition-colors group-hover:text-primary sm:mb-0 sm:text-sm">
                {item.title}
              </div>

              {/* Creator */}
              <div className="mb-1 font-mono text-xs text-muted-foreground sm:mb-0">
                <span className="mr-1 text-[10px] text-muted-foreground sm:hidden">Creator:</span>
                {item.creator !== '—' ? item.creator : ''}
              </div>

              {/* Genre */}
              {!isJob && (
                <div className="mb-1 sm:mb-0">
                  <span className="mr-1 text-[10px] text-muted-foreground sm:hidden">Genre:</span>
                  {item.genre && (
                    <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-300 ring-1 ring-inset ring-white/10">
                      {item.genre}
                    </span>
                  )}
                </div>
              )}

              {/* Status */}
              <div className="mb-1 flex items-center gap-1 sm:mb-0">
                <span className="mr-1 text-[10px] text-muted-foreground sm:hidden">Status:</span>
                {(() => {
                  const { prev, next } = getStatusNav(mediaType, item.status)
                  return (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleStatusChange(e, item, prev)}
                        disabled={!prev}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary disabled:invisible"
                        aria-label={prev ? `Back to ${prev}` : undefined}
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
                        {item.status}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleStatusChange(e, item, next)}
                        disabled={!next}
                        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary disabled:invisible"
                        aria-label={next ? `Advance to ${next}` : undefined}
                      >
                        <ChevronRight size={12} />
                      </button>
                    </>
                  )
                })()}
              </div>

              {/* Rating */}
              {!isJob && (
                <div className="mb-1 text-xs text-yellow-500 sm:mb-0">
                  <span className="mr-1 text-[10px] text-muted-foreground sm:hidden">Rating:</span>
                  {item.rating != null && item.rating > 0 ? `★ ${item.rating}` : ''}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit?.(item) }}
                  className="rounded p-1 text-muted-foreground hover:bg-primary/20 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  title="Edit"
                  aria-label="Edit"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, item)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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

      <ConfirmDialog
        open={!!deleteTarget}
        id={deleteTarget}
        title="Delete Entry"
        message="This action cannot be undone. Are you sure you want to delete this entry?"
        onConfirm={confirmDeleteAction}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

export default memo(MediaVault)
