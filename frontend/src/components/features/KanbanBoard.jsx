import CyberCard from './CyberCard'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'

export default function KanbanBoard({ items = [], mediaType = 'book', onUpdate, onDelete, onSelect }) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || ['To Read', 'Reading', 'Finished']

  const grouped = statuses.map(status => ({
    status,
    items: items.filter(item => item.status === status),
  }))

  return (
    <div className="grid h-full auto-rows-min grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
      {grouped.map(({ status, items: columnItems }) => (
        <div
          key={status}
          className="flex flex-col gap-3 rounded-xl border border-white/5 bg-black/20 p-3 relative backdrop-blur-md sm:gap-4 sm:p-4 md:max-h-[calc(100vh-200px)]"
        >
           <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_var(--color-primary)]"></div>

          <div className="flex items-center justify-between px-2 pt-2">
            <h2 className="font-mono text-sm font-semibold tracking-widest text-white uppercase sm:text-lg">
              // {status}
            </h2>
            <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white/10 text-[10px] font-bold font-mono sm:h-6 sm:w-6 sm:text-xs">
              {columnItems.length}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar sm:space-y-4 sm:pr-2">
             {columnItems.map(item => (
               <CyberCard
                 key={item.id || item.title}
                 item={item}
                 onUpdate={onUpdate}
                 onDelete={onDelete}
                 onSelect={onSelect}
               />
             ))}
             {columnItems.length === 0 && (
               <div className="border border-dashed border-white/10 rounded-xl p-6 text-center flex flex-col justify-center h-32 opacity-50 sm:p-8 sm:h-48">
                   <p className="font-mono text-xs tracking-wide sm:text-sm">NO_RECORDS_FOUND</p>
               </div>
             )}
          </div>
        </div>
      ))}
    </div>
  )
}
