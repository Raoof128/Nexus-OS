import { useEffect, useId, useRef, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { useTaskLists, useTaskMutations } from './hooks/useTasks'
import ListSidebar from './components/ListSidebar'
import TaskListView from './views/TaskListView'

export default function TasksApp() {
  const { data: lists = [] } = useTaskLists()
  const [selectedListId, setSelectedListId] = useState(null)
  const [starredActive, setStarredActive] = useState(false)
  const [sortMode, setSortMode] = useState('myorder')
  // Below the window's @md container breakpoint the list rail becomes an overlay
  // opened from the header "Lists" button (desktop widths keep the rail inline).
  const [navOpen, setNavOpen] = useState(false)
  const navId = useId()
  const navRef = useRef(null)
  const navToggleRef = useRef(null)
  const restoreFocusRef = useRef(false)
  const rootRef = useRef(null)

  // Derive the active list during render — falls back to the first list when the
  // selection is empty or stale (deleted), so no state-syncing effect is needed.
  const activeListId =
    selectedListId && lists.some((l) => l.id === selectedListId)
      ? selectedListId
      : (lists[0]?.id ?? null)

  // List-level mutations (independent of the items cache key).
  const { createList, deleteList, reorderList } = useTaskMutations(activeListId)

  const activeList = lists.find((l) => l.id === activeListId) || null

  // Opening the overlay moves focus into it: it is laid over the list, so focus
  // would otherwise stay behind it.
  useEffect(() => {
    if (navOpen) {
      navRef.current?.querySelector('[aria-current="page"], [data-list-btn]')?.focus()
    }
  }, [navOpen])

  // Closing returns focus to the Lists toggle. Picking a list also re-keys the
  // list view (which owns the toggle), so the focus restore waits for that commit.
  useEffect(() => {
    if (!navOpen && restoreFocusRef.current) {
      restoreFocusRef.current = false
      navToggleRef.current?.focus()
    }
  }, [navOpen, activeListId, starredActive])

  const closeNav = () => {
    restoreFocusRef.current = true
    setNavOpen(false)
  }

  const handleCreateList = (name) =>
    createList.mutate(name, {
      onSuccess: (created) => created?.id && setSelectedListId(created.id),
    })

  const handleDeleteList = (list) => deleteList.mutate(list.id)

  const onRootKeyDown = (e) => {
    if (e.key === 'Escape' && navOpen && e.target.tagName !== 'INPUT') {
      e.preventDefault()
      closeNav()
    }
  }

  const navToggle = (
    <button
      ref={navToggleRef}
      type="button"
      onClick={() => setNavOpen((v) => !v)}
      aria-expanded={navOpen}
      aria-controls={navId}
      className="w7-toolbtn shrink-0 @md:hidden"
    >
      <ListChecks size={14} aria-hidden="true" />
      <span>Lists</span>
    </button>
  )

  return (
    <div
      ref={rootRef}
      onKeyDown={onRootKeyDown}
      className="relative flex h-full w-full overflow-hidden text-[12px] text-foreground"
    >
      <div
        id={navId}
        ref={navRef}
        className={
          navOpen
            ? 'absolute inset-y-0 left-0 z-10 flex shadow-md @md:static @md:shadow-none'
            : 'hidden @md:flex'
        }
      >
        <ListSidebar
          lists={lists}
          activeListId={activeListId}
          starredActive={starredActive}
          onSelect={(id) => {
            setStarredActive(false)
            setSelectedListId(id)
            if (navOpen) closeNav()
          }}
          onToggleStarred={() => {
            setStarredActive((v) => !v)
            if (navOpen) closeNav()
          }}
          onCreate={handleCreateList}
          onDelete={handleDeleteList}
          onReorder={(id, position) => reorderList.mutate({ id, position })}
        />
      </div>
      {navOpen && (
        <div aria-hidden="true" onClick={closeNav} className="absolute inset-0 z-[5] @md:hidden" />
      )}

      {lists.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <p>No task lists yet.</p>
          <button
            type="button"
            onClick={() => handleCreateList('My Tasks')}
            className="w7-btn default"
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
          leading={navToggle}
        />
      )}
    </div>
  )
}
