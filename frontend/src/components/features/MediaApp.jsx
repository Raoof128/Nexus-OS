import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useMedia } from '../../hooks/useMedia'
import { MEDIA_TYPES, MEDIA_CONFIG, TYPE_ICONS } from '../../lib/mediaConfig'
import KanbanBoard from './KanbanBoard'
import MediaVault from './MediaVault'
import AddMediaDialog from './AddMediaDialog'
import LazyAICmdPalette from './LazyAICmdPalette'

const MediaDetailModal = lazy(() => import('./MediaDetailModal'))
const EditMediaDialog = lazy(() => import('./EditMediaDialog'))

export default function MediaApp() {
  const { session } = useAuth()
  const [activeType, setActiveType] = useState('book')
  const { items, loading: dataLoading, error, addMedia, updateMedia, deleteMedia } = useMedia(session, activeType)
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [vaultState, setVaultState] = useState(null)

  const selectedItem = useMemo(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null),
    [selectedItemId, items],
  )

  const openVault = useCallback((status, type) => {
    setVaultState({ status, type })
  }, [])

  const handleEdit = useCallback((item) => setEditItem(item), [])
  const handleSelect = useCallback((item) => setSelectedItemId(item.id), [])
  const handleCloseDetail = useCallback(() => setSelectedItemId(null), [])
  const handleCloseEdit = useCallback(() => setEditItem(null), [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Media type tabs — inside the window */}
      <nav className="shrink-0 border-b border-white/[0.04] bg-black/20">
        <div role="tablist" aria-label="Media types" className="flex items-center gap-1 overflow-x-auto px-3 py-1.5">
          {MEDIA_TYPES.map((type) => {
            const Icon = TYPE_ICONS[type]
            const isActive = activeType === type
            return (
              <button
                key={type}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => { setActiveType(type); setVaultState(null) }}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 heading-ui text-[10px] font-semibold uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={12} />
                {MEDIA_CONFIG[type].label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {dataLoading && items.length === 0 ? (
          <div className="flex h-full items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div role="alert" className="p-6 text-center font-bold uppercase tracking-widest text-destructive">
            API Error: {error}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {vaultState ? (
              <Motion.div
                key="vault"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.25 }}
              >
                <MediaVault
                  items={items}
                  mediaType={activeType}
                  filterStatus={vaultState.status}
                  onBack={() => setVaultState(null)}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                />
              </Motion.div>
            ) : (
              <Motion.div
                key="overview"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="p-3 sm:p-4"
              >
                <KanbanBoard
                  items={items}
                  mediaType={activeType}
                  onUpdate={updateMedia}
                  onDelete={deleteMedia}
                  onSelect={handleSelect}
                  onEdit={handleEdit}
                  onHeaderClick={openVault}
                />
              </Motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <Suspense fallback={null}>
        <MediaDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          onUpdate={updateMedia}
          onDelete={deleteMedia}
          onEdit={handleEdit}
        />
      </Suspense>
      <Suspense fallback={null}>
        <EditMediaDialog item={editItem} onUpdate={updateMedia} onClose={handleCloseEdit} />
      </Suspense>
      <AddMediaDialog mediaType={activeType} onAdd={addMedia} />
      <LazyAICmdPalette mediaType={activeType} onAdd={addMedia} />
    </div>
  )
}
