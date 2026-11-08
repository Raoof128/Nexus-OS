import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { APP_REGISTRY } from '../stores/appRegistry'
import { useWindowStore } from '../stores/windowStore'
import ApplicationsPanel from './SystemMonitor/ApplicationsPanel'
import MenuBar from './SystemMonitor/MenuBar'
import NetworkingPanel from './SystemMonitor/NetworkingPanel'
import PerformancePanel from './SystemMonitor/PerformancePanel'
import ProcessesPanel from './SystemMonitor/ProcessesPanel'
import ServicesPanel from './SystemMonitor/ServicesPanel'
import UsersPanel from './SystemMonitor/UsersPanel'
import { DEFAULT_TAB_ID, TABS, TAB_IDS, tabButtonId, tabPanelId } from './SystemMonitor/constants'
import { ctrlTabTarget, tabKeyTarget } from './SystemMonitor/keyboard'
import {
  apiServiceState,
  formatMegabytes,
  formatPercent,
  sessionServiceState,
} from './SystemMonitor/format'
import { useApiHealth } from './SystemMonitor/useApiHealth'
import { useOnlineStatus } from './SystemMonitor/useOnlineStatus'
import { useSystemSamples } from './SystemMonitor/useSystemSamples'

function TabPanel({ id, active, children }) {
  return (
    <article
      role="tabpanel"
      id={tabPanelId(id)}
      aria-labelledby={tabButtonId(id)}
      hidden={!active}
      className="min-h-0 flex-1 overflow-y-auto p-3"
    >
      {children}
    </article>
  )
}

export default function SystemMonitorApp({ windowId }) {
  const { session } = useAuth()
  const windows = useWindowStore((s) => s.windows)
  const zStack = useWindowStore((s) => s.zStack)
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const toggleLauncher = useWindowStore((s) => s.toggleLauncher)

  const [activeTab, setActiveTab] = useState(DEFAULT_TAB_ID)
  const [selectedId, setSelectedId] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const tabRefs = useRef({})
  const tablistRef = useRef(null)
  const [tabOverflow, setTabOverflow] = useState({ start: false, end: false })

  const health = useApiHealth({ autoRefresh })
  const samples = useSystemSamples()
  const online = useOnlineStatus()

  const windowList = useMemo(
    () => zStack.map((id) => windows[id]).filter(Boolean),
    [windows, zStack],
  )
  const selected = windowList.find((w) => w.windowId === selectedId) ?? null
  const user = session?.user
  const userName = user?.email || '—'
  const provider = user?.app_metadata?.provider || 'email'
  const connection = typeof navigator !== 'undefined' ? navigator.connection : undefined

  // The tab strip scrolls sideways when the window is narrow. These edges
  // drive the fade cues that show more tabs exist beyond either side.
  const updateTabOverflow = useCallback(() => {
    const el = tablistRef.current
    if (!el) return
    const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft
    setTabOverflow({ start: el.scrollLeft > 1, end: remaining > 1 })
  }, [])

  // ResizeObserver fires once on observe, which covers the first measurement.
  useEffect(() => {
    const el = tablistRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(updateTabOverflow)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateTabOverflow])

  // Scroll only the tab strip so the chosen tab is fully visible. focus() alone
  // does not reliably do this for a tab clipped at the strip edge.
  const revealTab = useCallback((id) => {
    const list = tablistRef.current
    const tab = tabRefs.current[id]
    if (!list || !tab) return
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = left
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth
  }, [])

  const selectTab = useCallback(
    (id, { focus = false } = {}) => {
      setActiveTab(id)
      revealTab(id)
      if (focus) tabRefs.current[id]?.focus()
    },
    [revealTab],
  )

  const handleTabKeyDown = (event) => {
    const id = tabKeyTarget(event.key, activeTab, TAB_IDS)
    if (!id) return
    event.preventDefault()
    selectTab(id, { focus: true })
  }

  const handleRootKeyDown = (event) => {
    if (event.key === 'F5') {
      event.preventDefault()
      health.refresh()
      return
    }
    const id = ctrlTabTarget(event, activeTab, TAB_IDS)
    if (id) {
      event.preventDefault()
      selectTab(id, { focus: true })
    }
  }

  const endTask = () => {
    if (!selected) return
    const index = windowList.indexOf(selected)
    const neighbour = windowList[index + 1] ?? windowList[index - 1] ?? null
    closeWindow(selected.windowId)
    setSelectedId(neighbour?.windowId ?? null)
    // The End Task button disables when nothing is left to end, so move focus
    // to the tab list rather than letting it fall to the document body.
    if (!neighbour) tabRefs.current[activeTab]?.focus()
  }

  const menus = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new-task', label: 'New Task…', onSelect: () => toggleLauncher() },
        { id: 'file-sep', separator: true },
        {
          id: 'exit',
          label: 'Exit',
          onSelect: () => {
            if (windowId) closeWindow(windowId)
          },
        },
      ],
    },
    {
      id: 'options',
      label: 'Options',
      items: [
        {
          id: 'auto-refresh',
          label: 'Refresh every 30 seconds',
          checkable: true,
          checked: autoRefresh,
          onSelect: () => setAutoRefresh((value) => !value),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'refresh', label: 'Refresh', shortcut: 'F5', onSelect: () => health.refresh() },
      ],
    },
    {
      id: 'windows',
      label: 'Windows',
      items:
        windowList.length > 0
          ? windowList.map((w) => ({
              id: w.windowId,
              label: w.title,
              onSelect: () => focusWindow(w.windowId),
            }))
          : [{ id: 'no-windows', label: 'No windows are open', disabled: true }],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        {
          id: 'shortcuts',
          label: 'Keyboard shortcuts',
          onSelect: () => setShowShortcuts((value) => !value),
        },
      ],
    },
  ]

  const apiState = apiServiceState(health.status)
  const hasSession = Boolean(session)

  const heap = samples.heap
    ? {
        percent: samples.heap.percent,
        used: formatMegabytes(samples.heap.usedBytes),
        limit: formatMegabytes(samples.heap.limitBytes),
        history: samples.heapHistory,
      }
    : null

  const panels = {
    applications: (
      <ApplicationsPanel
        windows={windowList}
        selectedId={selected?.windowId ?? null}
        onSelect={setSelectedId}
        onSwitchTo={(id) => focusWindow(id)}
        onEndTask={endTask}
        onNewTask={() => toggleLauncher()}
      />
    ),
    processes: <ProcessesPanel windows={windowList} userName={userName} />,
    services: (
      <ServicesPanel
        apiState={apiState}
        apiLatency={health.latency}
        lastCheck={health.lastCheck}
        apiChecking={health.status === 'checking'}
        onCheckNow={() => health.refresh()}
        sessionState={sessionServiceState(hasSession)}
      />
    ),
    performance: (
      <PerformancePanel
        cpu={{
          supported: samples.cpuSupported,
          current: samples.cpu,
          history: samples.cpuHistory,
        }}
        heap={heap}
        deviceMemoryGb={typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined}
      />
    ),
    networking: <NetworkingPanel online={online} connection={connection} />,
    users: <UsersPanel userName={userName} signedIn={hasSession} provider={provider} />,
  }

  return (
    <div className="flex h-full w-full flex-col text-[12px]" onKeyDown={handleRootKeyDown}>
      <MenuBar menus={menus} />

      {showShortcuts && (
        <p className="w7-infobar mx-3 mt-2 shrink-0" role="note">
          Left and Right arrows change tabs. Ctrl+Tab goes to the next tab and Ctrl+Shift+Tab to the
          previous one. F5 refreshes. Up and Down arrows select a row, and Enter switches to it.
        </p>
      )}

      {/* The strip scrolls sideways instead of clipping; top padding keeps the raised selected tab inside it. */}
      <div className="relative shrink-0">
        <menu
          ref={tablistRef}
          role="tablist"
          aria-label="Task Manager sections"
          className="flex overflow-x-auto overflow-y-hidden pt-[2px] [&>button]:shrink-0"
          onKeyDown={handleTabKeyDown}
          onScroll={updateTabOverflow}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el
                }}
                type="button"
                role="tab"
                id={tabButtonId(tab.id)}
                aria-controls={tabPanelId(tab.id)}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => selectTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </menu>
        {tabOverflow.start && (
          <div
            aria-hidden="true"
            data-testid="sysmon-tabs-fade-start"
            className="pointer-events-none absolute inset-y-0 left-0 w-6"
            style={{ background: 'linear-gradient(to left, rgba(255,255,255,0), #fff)' }}
          />
        )}
        {tabOverflow.end && (
          <div
            aria-hidden="true"
            data-testid="sysmon-tabs-fade-end"
            className="pointer-events-none absolute inset-y-0 right-0 w-6"
            style={{ background: 'linear-gradient(to right, rgba(255,255,255,0), #fff)' }}
          />
        )}
      </div>

      {TABS.map((tab) => (
        <TabPanel key={tab.id} id={tab.id} active={activeTab === tab.id}>
          {panels[tab.id]}
        </TabPanel>
      ))}

      <div className="status-bar shrink-0">
        <p className="status-bar-field">Processes: {windowList.length}</p>
        <p
          className="status-bar-field"
          title="Estimated from this page's main thread, not the whole computer"
        >
          Page CPU (est.): {formatPercent(samples.cpu)}
        </p>
        <p className="status-bar-field" title="JavaScript heap of this page, Chrome only">
          JS heap: {heap ? formatPercent(heap.percent) : '—'}
        </p>
      </div>
    </div>
  )
}
