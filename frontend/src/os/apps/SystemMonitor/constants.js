// Windows 7 Task Manager tab order. Applications is the default tab.
export const TABS = [
  { id: 'applications', label: 'Applications' },
  { id: 'processes', label: 'Processes' },
  { id: 'services', label: 'Services' },
  { id: 'performance', label: 'Performance' },
  { id: 'networking', label: 'Networking' },
  { id: 'users', label: 'Users' },
]

export const TAB_IDS = TABS.map((tab) => tab.id)
export const DEFAULT_TAB_ID = 'applications'

export const HEALTH_INTERVAL_MS = 30_000
export const SAMPLE_INTERVAL_MS = 1_000
export const HISTORY_LENGTH = 60

export function tabButtonId(id) {
  return `sysmon-tab-${id}`
}

export function tabPanelId(id) {
  return `sysmon-panel-${id}`
}
