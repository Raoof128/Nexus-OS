import { memo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Sparkles } from 'lucide-react'
import CyberCard from './CyberCard'
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
import { useState } from 'react'

const MAX_PREVIEW = 5

function SortableCard({ item, onUpdate, onDelete, onSelect, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { status: item.status },
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none',
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div {...listeners} className="cursor-grab active:cursor-grabbing">
        <CyberCard
          item={item}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      </div>
    </div>
  )
}

function KanbanBoard({ items = [], mediaType = 'book', onUpdate, onDelete, onSelect, onEdit, onHeaderClick, onAiSuggest }) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || ['To Read', 'Reading', 'Finished']
  const [activeItem, setActiveItem] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const grouped = statuses.map(status => {
    const all = items.filter(item => item.status === status)
    return {
      status,
      items: all.slice(0, MAX_PREVIEW),
      total: all.length,
      hasMore: all.length > MAX_PREVIEW,
    }
  })

  const handleDragStart = useCallback((event) => {
    const draggedItem = items.find(i => i.id === event.active.id)
    setActiveItem(draggedItem || null)
  }, [items])

  const handleDragEnd = useCallback((event) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over || !onUpdate) return

    const draggedId = active.id
    const overData = over.data?.current
    const targetStatus = overData?.status || overData?.columnStatus
    if (!targetStatus) return

    const draggedItem = items.find(i => i.id === draggedId)
    if (!draggedItem || draggedItem.status === targetStatus) return

    onUpdate({ mediaId: draggedId, data: { status: targetStatus } })
  }, [items, onUpdate])

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  const gridColsClass = mediaType === 'job'
    ? 'md:grid-cols-2 lg:grid-cols-3'
    : 'md:grid-cols-3'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={`grid h-full auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 ${gridColsClass}`}>
        {grouped.map(({ status, items: columnItems, total, hasMore }) => (
          <DroppableColumn
            key={status}
            status={status}
            columnItems={columnItems}
            total={total}
            hasMore={hasMore}
            mediaType={mediaType}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSelect={onSelect}
            onEdit={onEdit}
            onHeaderClick={onHeaderClick}
            onAiSuggest={onAiSuggest}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeItem ? (
          <div className="rotate-2 scale-105 opacity-90">
            <CyberCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function DroppableColumn({ status, columnItems, total, hasMore, mediaType, onUpdate, onDelete, onSelect, onEdit, onHeaderClick, onAiSuggest }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { columnStatus: status },
  })

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${status} column, ${total} items`}
      className={`neon-border flex flex-col gap-3 rounded-xl glass-panel p-3 relative max-h-[60dvh] sm:gap-4 sm:p-4 sm:max-h-[calc(100dvh-200px)] transition-colors ${isOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
    >
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_var(--color-primary)]"></div>

      <button
        type="button"
        onClick={() => onHeaderClick?.(status, mediaType)}
        aria-label={`${status} — open vault`}
        className="flex items-center justify-between px-2 pt-2 text-left transition-colors hover:opacity-80"
      >
        <h2 className="heading-display text-xs font-bold text-white sm:text-sm">
          <span aria-hidden="true">// </span>{status}
        </h2>
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-white/10 text-[10px] font-bold font-mono sm:h-6 sm:w-6 sm:text-xs">
          {total}
        </span>
      </button>

      <div className="flex-1 space-y-3 overflow-y-auto pr-1 custom-scrollbar sm:space-y-4 sm:pr-2">
        {columnItems.map(item => (
          <SortableCard
            key={item.id}
            item={item}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onSelect={onSelect}
            onEdit={onEdit}
          />
        ))}
        {columnItems.length === 0 && (
          <div className="border border-dashed border-white/10 rounded-xl p-6 text-center flex flex-col items-center justify-center gap-3 h-24 sm:p-8 sm:h-36">
            <p className="font-mono text-xs tracking-wide text-muted-foreground/50 sm:text-sm">NO_RECORDS_FOUND</p>
            {onAiSuggest && (
              <button
                type="button"
                onClick={() => onAiSuggest(status, mediaType)}
                className="flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 font-mono text-[10px] text-primary/70 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary sm:text-xs"
              >
                <Sparkles size={12} />
                Ask AI for ideas
              </button>
            )}
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
  )
}

export default memo(KanbanBoard)
