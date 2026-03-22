import { memo } from 'react'
import CyberCard from './CyberCard'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

const MAX_PREVIEW = 5

function KanbanBoard({ items = [], mediaType = 'book', onUpdate, onDelete, onSelect, onEdit, onHeaderClick }) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || ['To Read', 'Reading', 'Finished']

  const grouped = statuses.map(status => {
    const all = items.filter(item => item.status === status)
    return {
      status,
      items: all.slice(0, MAX_PREVIEW),
      total: all.length,
      hasMore: all.length > MAX_PREVIEW,
    }
  })

  return (
    <div className="grid h-full auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3">
      {grouped.map(({ status, items: columnItems, total, hasMore }) => (
        <div
          key={status}
          className="neon-border flex flex-col gap-3 rounded-xl glass-panel p-3 relative max-h-[60vh] sm:gap-4 sm:p-4 sm:max-h-[calc(100vh-200px)]"
        >
           <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_var(--color-primary)]"></div>

          <button
            type="button"
            onClick={() => onHeaderClick?.(status, mediaType)}
            aria-label={`${status} — open vault`}
            className="flex items-center justify-between px-2 pt-2 text-left transition-colors hover:opacity-80"
          >
            <h2 className="heading-display text-xs font-bold text-white sm:text-sm">
              // {status}
            </h2>
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white/10 text-[10px] font-bold font-mono sm:h-6 sm:w-6 sm:text-xs">
              {total}
            </span>
          </button>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar sm:space-y-4 sm:pr-2">
             {columnItems.map(item => (
               <CyberCard
                 key={item.id}
                 item={item}
                 onUpdate={onUpdate}
                 onDelete={onDelete}
                 onSelect={onSelect}
                 onEdit={onEdit}
               />
             ))}
             {columnItems.length === 0 && (
               <div className="border border-dashed border-white/10 rounded-xl p-6 text-center flex flex-col justify-center h-32 opacity-50 sm:p-8 sm:h-48">
                   <p className="font-mono text-xs tracking-wide sm:text-sm">NO_RECORDS_FOUND</p>
               </div>
             )}
             {hasMore && (
               <button
                 type="button"
                 onClick={() => onHeaderClick?.(status, mediaType)}
                 className="w-full rounded-lg border border-dashed border-primary/20 py-3 font-mono text-xs text-primary/60 transition-colors hover:border-primary/40 hover:text-primary"
               >
                 + {total - MAX_PREVIEW} more — Open Vault
               </button>
             )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(KanbanBoard)
