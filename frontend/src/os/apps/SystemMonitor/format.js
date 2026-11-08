// Text helpers and Windows 7 status vocabulary for the Task Manager.

export function formatMegabytes(bytes) {
  return `${Math.round(bytes / 1048576)} MB`
}

// navigator.deviceMemory is bucketed and capped at 8, so 8 means "8 GB or more".
export function formatDeviceMemory(gigabytes) {
  if (!gigabytes) return '—'
  return gigabytes >= 8 ? '8 GB or more' : `${gigabytes} GB`
}

export function formatPercent(value) {
  return value == null ? '—' : `${value}%`
}

export function formatClockTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

// Service states. Every state is derived from a real signal, never hard-coded.
export const SERVICE_STATE_LABELS = {
  running: 'Running',
  stopped: 'Stopped',
  starting: 'Starting…',
  idle: 'Idle',
  unknown: 'Unknown',
}

export function apiServiceState(status) {
  if (status === 'online') return 'running'
  if (status === 'offline') return 'stopped'
  if (status === 'checking') return 'starting'
  return 'unknown'
}

export function sessionServiceState(hasSession) {
  return hasSession ? 'running' : 'stopped'
}
