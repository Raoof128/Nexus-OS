import { useRef } from 'react'
import { listKeyTarget } from './keyboard'

// Applications tab: the open windows, with Switch To and End Task acting on
// the selected row, and New Task... opening the Start menu program list.
export default function ApplicationsPanel({
  windows,
  selectedId,
  onSelect,
  onSwitchTo,
  onEndTask,
  onNewTask,
}) {
  const rowRefs = useRef([])
  const selectedIndex = windows.findIndex((w) => w.windowId === selectedId)
  const selected = selectedIndex >= 0 ? windows[selectedIndex] : null
  // With no selection the first row stays reachable from the Tab sequence.
  const focusableIndex = selectedIndex >= 0 ? selectedIndex : 0

  const onRowKeyDown = (event, index) => {
    const next = listKeyTarget(event.key, index, windows.length)
    if (next != null) {
      event.preventDefault()
      onSelect(windows[next].windowId)
      rowRefs.current[next]?.focus()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      onSwitchTo(windows[index].windowId)
    }
  }

  return (
    <>
      <table role="grid" aria-label="Running applications" className="w-full">
        <thead>
          <tr>
            <th scope="col">Task</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {windows.length > 0 ? (
            windows.map((w, index) => {
              const isSelected = w.windowId === selectedId
              return (
                <tr
                  key={w.windowId}
                  ref={(el) => {
                    rowRefs.current[index] = el
                  }}
                  role="row"
                  aria-selected={isSelected}
                  tabIndex={index === focusableIndex ? 0 : -1}
                  className={`pointer-coarse:[&>td]:py-3 ${isSelected ? 'highlighted' : ''}`}
                  onClick={() => onSelect(w.windowId)}
                  onDoubleClick={() => onSwitchTo(w.windowId)}
                  onKeyDown={(event) => onRowKeyDown(event, index)}
                >
                  <td>{w.title}</td>
                  <td>{w.state === 'minimized' ? 'Minimized' : 'Running'}</td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan={2}>No windows are open.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button type="button" className="w7-btn pointer-coarse:min-h-11" onClick={onNewTask}>
          New Task…
        </button>
        <button
          type="button"
          className="w7-btn pointer-coarse:min-h-11"
          disabled={!selected}
          onClick={() => selected && onSwitchTo(selected.windowId)}
        >
          Switch To
        </button>
        <button
          type="button"
          className="w7-btn pointer-coarse:min-h-11"
          disabled={!selected}
          onClick={onEndTask}
        >
          End Task
        </button>
      </div>
    </>
  )
}
