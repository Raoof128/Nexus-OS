import { memo, useCallback, useState } from 'react'
// Keyboard reorder: the focusable node must carry dnd-kit's attributes AND
// listeners (KeyboardSensor only starts a drag when keydown targets the
// activator node), so both are spread on the same element below.
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Sparkles } from 'lucide-react'
import CyberCard from '../../../components/ui/CyberCard'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'

const MAX_PREVIEW = 5

function SortableCard({ item, onUpdate, onDelete, onSelect, onEdit }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { status: item.status },
  })

  // One element is both the sortable node and the activator, so Space/Enter on
  // the focused card picks it up and arrow keys move it.
  const setCardRef = useCallback(
    (element) => {
      setNodeRef(element)
      setActivatorNodeRef(element)
    },
    [setNodeRef, setActivatorNodeRef],
  )

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    touchAction: 'none',
  }

  return (
    // dnd-kit gives this node role=button and aria-pressed. That would make the
    // card's own Edit/Delete buttons children of a button, so expose it as a
    // group with the same sortable description instead.
    <div
      ref={setCardRef}
      style={style}
      {...attributes}
      role="group"
      aria-pressed={undefined}
      {...listeners}
      className="cursor-grab active:cursor-grabbing"
    >
      <CyberCard
        item={item}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onSelect={onSelect}
        onEdit={onEdit}
      />
    </div>
  )
}

function KanbanBoard({
  items = [],
  mediaType = 'book',
  onUpdate,
  onDelete,
  onSelect,
  onEdit,
  onHeaderClick,
  onAiSuggest,
  onAddRequest,
}) {
  const statuses = MEDIA_CONFIG[mediaType]?.statuses || ['To Read', 'Reading', 'Finished']
  const [activeItem, setActiveItem] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const grouped = statuses.map((status) => {
    const all = items.filter((item) => item.status === status)
    return {
      status,
      items: all.slice(0, MAX_PREVIEW),
      total: all.length,
      hasMore: all.length > MAX_PREVIEW,
    }
  })

  const handleDragStart = useCallback(
    (event) => {
      const draggedItem = items.find((i) => i.id === event.active.id)
      setActiveItem(draggedItem || null)
    },
    [items],
  )

  const handleDragEnd = useCallback(
    (event) => {
      setActiveItem(null)
      const { active, over } = event
      if (!over || !onUpdate) return

      const draggedId = active.id
      const overData = over.data?.current
      const targetStatus = overData?.status || overData?.columnStatus
      if (!targetStatus) return

      const draggedItem = items.find((i) => i.id === draggedId)
      if (!draggedItem || draggedItem.status === targetStatus) return

      onUpdate({ mediaId: draggedId, data: { status: targetStatus } })
    },
    [items, onUpdate],
  )

  const handleDragCancel = useCallback(() => {
    setActiveItem(null)
  }, [])

  // Derive column count from the config's status list so new statuses don't wrap.
  const statusCount = statuses.length
  const gridColsClass =
    statusCount >= 4
      ? '@md:grid-cols-2 @lg:grid-cols-4'
      : statusCount === 3
        ? '@md:grid-cols-3'
        : '@md:grid-cols-2'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div
        className={`grid h-full auto-rows-min grid-cols-1 gap-3 @sm:grid-cols-2 @sm:gap-4 ${gridColsClass}`}
      >
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
            onAddRequest={onAddRequest}
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

function DroppableColumn({
  status,
  columnItems,
  total,
  hasMore,
  mediaType,
  onUpdate,
  onDelete,
  onSelect,
  onEdit,
  onHeaderClick,
  onAiSuggest,
  onAddRequest,
}) {
  const config = MEDIA_CONFIG[mediaType]
  const singular = config?.singular || 'entry'
  const plural = (config?.label || 'entries').toLowerCase()
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { columnStatus: status },
  })

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`${status} column, ${total} items`}
      className={`relative flex max-h-[50dvh] flex-col gap-2 rounded-[3px] border p-2 transition-colors @sm:gap-3 @sm:p-3 ${
        isOver ? 'border-w7-select-border bg-w7-select' : 'border-border bg-w7-pane'
      }`}
    >
      <h2 className="w7-subheading min-w-0">
        <button
          type="button"
          onClick={() => onHeaderClick?.(status, mediaType)}
          aria-label={`${status} — open vault`}
          className="flex w-full items-center justify-between gap-2 px-1 text-left hover:opacity-80 pointer-coarse:min-h-11"
        >
          <span className="truncate">{status}</span>
          <span className="w7-badge tabular-nums">{total}</span>
        </button>
      </h2>

      <SortableContext items={columnItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-2 overflow-y-auto pr-1 @sm:space-y-3">
          {columnItems.map((item) => (
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
            <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-[#c5cad3] bg-white p-4 text-center @sm:h-40 @sm:p-6">
              <p className="text-[12px] text-muted-foreground">
                No {plural} here yet. Add one, or drag one here from another column.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {onAddRequest && (
                  <button
                    type="button"
                    onClick={() => onAddRequest(status)}
                    className="w7-btn pointer-coarse:min-h-11"
                  >
                    <Plus size={12} aria-hidden="true" />
                    Add {singular}…
                  </button>
                )}
                {onAiSuggest && (
                  <button
                    type="button"
                    onClick={() => onAiSuggest(status, mediaType)}
                    className="w7-btn pointer-coarse:min-h-11"
                  >
                    <Sparkles size={12} aria-hidden="true" />
                    Ask AI
                  </button>
                )}
              </div>
            </div>
          )}
          {hasMore && (
            <button
              type="button"
              onClick={() => onHeaderClick?.(status, mediaType)}
              className="w7-btn w-full pointer-coarse:min-h-11"
            >
              Show {total - MAX_PREVIEW} more
            </button>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export default memo(KanbanBoard)
