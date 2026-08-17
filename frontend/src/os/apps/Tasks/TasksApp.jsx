import { useRef, useState } from 'react'
import { useTaskLists, useTaskMutations } from './hooks/useTasks'
import ListSidebar from './components/ListSidebar'
import TaskListView from './views/TaskListView'
import { useAuth } from '../../../hooks/useAuth'

export default function TasksApp() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const { data: lists = [], isLoading, error, refetch } = useTaskLists()
  const [selectedListId, setSelectedListId] = useState(null)
  const [starredActive, setStarredActive] = useState(false)
  const [sortMode, setSortMode] = useState('myorder')
  const rootRef = useRef(null)

  // Derive the active list during render — falls back to the first list when the
  // selection is empty or stale (deleted), so no state-syncing effect is needed.
  const activeListId =
    selectedListId && lists.some((l) => l.id === selectedListId)
      ? selectedListId
      : (lists[0]?.id ?? null)

  // List-level mutations (independent of the items cache key).
  const { createList, deleteList, renameList, reorderList } = useTaskMutations(activeListId)

  const activeList = lists.find((l) => l.id === activeListId) || null

  const handleCreateList = (name) =>
    createList.mutate(name, {
      onSuccess: (created) => created?.id && setSelectedListId(created.id),
    })

  const handleDeleteList = (list) => deleteList.mutate(list.id)
  const handleRenameList = (list, name) => renameList.mutate({ id: list.id, name })

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col overflow-hidden text-white @lg:flex-row"
    >
      <ListSidebar
        lists={lists}
        activeListId={activeListId}
        starredActive={starredActive}
        onSelect={(id) => {
          setStarredActive(false)
          setSelectedListId(id)
        }}
        onToggleStarred={() => setStarredActive((v) => !v)}
        onCreate={handleCreateList}
        onDelete={handleDeleteList}
        onRename={handleRenameList}
        onReorder={(id, position) => reorderList.mutate({ id, position })}
      />

      {isLoading ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading task lists…
        </p>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-sm text-red-200"
        >
          <p>{error.message || 'Unable to load task lists.'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg border border-red-300/30 px-3 py-2 text-xs hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60"
          >
            Retry
          </button>
        </div>
      ) : lists.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <p className="text-sm">No task lists yet.</p>
          <button
            type="button"
            onClick={() => handleCreateList('My Tasks')}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-black hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            Create your first list
          </button>
        </div>
      ) : (
        <TaskListView
          key={`${activeListId}:${starredActive}`}
          listId={activeListId}
          listName={activeList?.name}
          lists={lists}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          starredActive={starredActive}
          rootRef={rootRef}
          userId={userId}
        />
      )}
    </div>
  )
}
