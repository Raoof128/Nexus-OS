import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion as Motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useMedia } from '../../../hooks/useMedia'
import { MEDIA_TYPES, MEDIA_CONFIG, TYPE_ICONS } from '../../../lib/mediaConfig'
import { DURATION } from '../../../lib/motion'
import KanbanBoard from './KanbanBoard'
import { getTabKeyTarget } from './tablistKeys'
import MediaVault from './MediaVault'
import AddMediaDialog from './AddMediaDialog'
import LazyAICmdPalette from '../Chat/LazyAICmdPalette'

const MediaDetailModal = lazy(() => import('./MediaDetailModal'))
const EditMediaDialog = lazy(() => import('./EditMediaDialog'))

const QUERY_KEY = 'type'

function readInitialType() {
  if (typeof window === 'undefined') return 'book'
  const fromUrl = new URLSearchParams(window.location.search).get(QUERY_KEY)
  return MEDIA_TYPES.includes(fromUrl) ? fromUrl : 'book'
}

export default function LibraryApp() {
  const { session } = useAuth()
  const [activeType, setActiveType] = useState(readInitialType)
  const {
    items,
    loading: dataLoading,
    error,
    refreshing,
    refetch,
    addMedia,
    updateMedia,
    deleteMedia,
  } = useMedia(session, activeType)
  // A failed status move or delete from the board, vault or detail view has
  // no dialog of its own, so it is reported here. The list stays on screen.
  const [actionError, setActionError] = useState(null)

  // Mirror activeType into the URL so refresh/back buttons preserve context.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get(QUERY_KEY) === activeType) return
    url.searchParams.set(QUERY_KEY, activeType)
    window.history.replaceState({}, '', url)
  }, [activeType])
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [editItem, setEditItem] = useState(null)
  const [vaultState, setVaultState] = useState(null)
  const tabRefs = useRef([])

  const selectedItem = useMemo(
    () => (selectedItemId ? (items.find((i) => i.id === selectedItemId) ?? null) : null),
    [selectedItemId, items],
  )

  const openVault = useCallback((status, type) => {
    setVaultState({ status, type })
  }, [])

  const handleEdit = useCallback((item) => setEditItem(item), [])
  const handleSelect = useCallback((item) => setSelectedItemId(item.id), [])
  const handleCloseDetail = useCallback(() => setSelectedItemId(null), [])
  const handleCloseEdit = useCallback(() => setEditItem(null), [])

  const selectType = useCallback((type) => {
    setActiveType(type)
    setVaultState(null)
  }, [])

  const handleBoardUpdate = useCallback(
    (variables) =>
      updateMedia(variables).catch(() =>
        setActionError('The status couldn’t be changed. Check your connection, then try again.'),
      ),
    [updateMedia],
  )
  const handleBoardDelete = useCallback(
    (mediaId) =>
      deleteMedia(mediaId).catch(() =>
        setActionError('The entry couldn’t be deleted. Check your connection, then try again.'),
      ),
    [deleteMedia],
  )

  const handleAddRequest = useCallback((status) => {
    window.dispatchEvent(new CustomEvent('nexus:open-add-media', { detail: { status } }))
  }, [])
  const handleAiSuggest = useCallback(() => {
    window.dispatchEvent(new Event('nexus:open-ai-cmd'))
  }, [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {/* Media type tabs (Windows 7 tab control) */}
      <div className="shrink-0 px-2 pt-2">
        <menu
          role="tablist"
          aria-label="Media types"
          className="flex items-end gap-0.5 overflow-x-auto"
        >
          {MEDIA_TYPES.map((type, index) => {
            const Icon = TYPE_ICONS[type]
            const isActive = activeType === type
            return (
              <button
                key={type}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                id={`library-tab-${type}`}
                role="tab"
                aria-selected={isActive}
                aria-controls="library-tabpanel"
                tabIndex={isActive ? 0 : -1}
                type="button"
                onClick={() => selectType(type)}
                onKeyDown={(event) => {
                  const target = getTabKeyTarget({
                    key: event.key,
                    index,
                    count: MEDIA_TYPES.length,
                    ctrlKey: event.ctrlKey,
                    shiftKey: event.shiftKey,
                  })
                  if (target === null) return
                  event.preventDefault()
                  selectType(MEDIA_TYPES[target])
                  tabRefs.current[target]?.focus()
                }}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap pointer-coarse:min-h-11"
              >
                <Icon size={14} aria-hidden="true" />
                {MEDIA_CONFIG[type].label}
              </button>
            )
          })}
        </menu>
      </div>

      {/* Command bar */}
      <div className="w7-commandbar shrink-0">
        <AddMediaDialog mediaType={activeType} onAdd={addMedia} />
        <LazyAICmdPalette mediaType={activeType} onAdd={addMedia} placement="inline" />
      </div>

      {/* Content */}
      <article
        id="library-tabpanel"
        role="tabpanel"
        aria-labelledby={`library-tab-${activeType}`}
        className="min-h-0 flex-1 overflow-y-auto bg-background"
      >
        {dataLoading && items.length === 0 ? (
          <div
            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-muted-foreground"
            role="status"
            aria-label="Loading media"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p>Loading…</p>
          </div>
        ) : error && items.length === 0 ? (
          <div role="alert" className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="w7-error">
              Your media couldn&rsquo;t be loaded. {error} Check your connection, then select Retry.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={refreshing}
              className="w7-btn pointer-coarse:min-h-11"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 border-b border-border bg-w7-pane px-3 py-2"
              >
                <p className="w7-error min-w-0 flex-1 text-[12px]">
                  Couldn&rsquo;t refresh your media. Showing the last list that loaded.
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  disabled={refreshing}
                  className="w7-btn pointer-coarse:min-h-11"
                >
                  Retry
                </button>
              </div>
            )}
            {actionError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 border-b border-border bg-w7-pane px-3 py-2"
              >
                <p className="w7-error min-w-0 flex-1 text-[12px]">{actionError}</p>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  className="w7-btn pointer-coarse:min-h-11"
                >
                  Dismiss
                </button>
              </div>
            )}
            <AnimatePresence mode="wait">
              {vaultState ? (
                <Motion.div
                  key="vault"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: DURATION.slow }}
                >
                  <MediaVault
                    items={items}
                    mediaType={activeType}
                    filterStatus={vaultState.status}
                    selectedId={selectedItemId}
                    onBack={() => setVaultState(null)}
                    onUpdate={handleBoardUpdate}
                    onDelete={handleBoardDelete}
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
                  transition={{ duration: DURATION.slow }}
                  className="p-3 sm:p-4"
                >
                  <KanbanBoard
                    items={items}
                    mediaType={activeType}
                    onUpdate={handleBoardUpdate}
                    onDelete={handleBoardDelete}
                    onSelect={handleSelect}
                    onEdit={handleEdit}
                    onHeaderClick={openVault}
                    onAddRequest={handleAddRequest}
                    onAiSuggest={handleAiSuggest}
                  />
                </Motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </article>

      <Suspense fallback={null}>
        <MediaDetailModal
          item={selectedItem}
          onClose={handleCloseDetail}
          onUpdate={handleBoardUpdate}
          onDelete={handleBoardDelete}
          onEdit={handleEdit}
        />
      </Suspense>
      <Suspense fallback={null}>
        <EditMediaDialog item={editItem} onUpdate={updateMedia} onClose={handleCloseEdit} />
      </Suspense>
    </div>
  )
}
