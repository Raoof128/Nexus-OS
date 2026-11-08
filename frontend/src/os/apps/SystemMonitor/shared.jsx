import { SERVICE_STATE_LABELS } from './format'

// Theme tokens from index.css, so the dots follow the palette.
const STATE_DOT_CLASSES = {
  running: 'bg-success',
  stopped: 'bg-destructive',
  starting: 'bg-warning',
  idle: 'bg-muted-foreground',
  unknown: 'bg-muted-foreground',
}

export function ServiceStatus({ state }) {
  const label = SERVICE_STATE_LABELS[state] || SERVICE_STATE_LABELS.unknown
  return (
    <span className="inline-flex items-center gap-2 text-foreground">
      <span
        aria-hidden="true"
        className={`inline-block h-2 w-2 rounded-full ${STATE_DOT_CLASSES[state] || STATE_DOT_CLASSES.unknown}`}
      />
      {label}
    </span>
  )
}

export function DataRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  )
}

export function Gauge({ label, value }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? 0}
      aria-valuetext={value == null ? 'Not available' : `${value}%`}
      className="my-2"
    >
      <div style={{ width: `${value ?? 0}%` }} />
    </div>
  )
}

export function HistoryGraph({ label, values }) {
  const latest = values.length ? values[values.length - 1] : null
  const summary =
    latest == null
      ? `${label}: no samples yet`
      : `${label}: latest ${latest}% over ${values.length} seconds`
  return (
    <div
      role="img"
      aria-label={summary}
      className="flex h-16 items-end gap-px border border-border bg-white p-px"
    >
      {values.map((value, index) => (
        <div
          // Samples only ever append, so position is a stable key.
          key={index}
          aria-hidden="true"
          className="min-w-0 flex-1 bg-primary"
          style={{ height: `${Math.max(value, 1)}%` }}
        />
      ))}
    </div>
  )
}
