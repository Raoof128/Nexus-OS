import { RECURRENCE_PRESETS, buildRRule, labelForRRule } from '../lib/recurrence'

// Maps the current rrule value back to a preset key for the <select>.
function presetForValue(value) {
  if (!value) return 'none'
  const match = RECURRENCE_PRESETS.find((p) => p.rrule === value)
  return match ? match.value : 'custom'
}

export default function RecurrencePicker({ value, onChange }) {
  const preset = presetForValue(value)

  const handlePreset = (e) => {
    const next = e.target.value
    if (next === 'custom') {
      // Keep any existing custom rule; otherwise start an editable blank one.
      onChange(value && presetForValue(value) === 'custom' ? value : 'FREQ=WEEKLY;BYDAY=MO')
    } else {
      onChange(buildRRule(next))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Repeat
      </label>
      <select
        value={preset}
        onChange={handlePreset}
        aria-label="Recurrence"
        className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 text-sm text-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {RECURRENCE_PRESETS.map((p) => (
          <option key={p.value} value={p.value} className="bg-zinc-900">
            {p.label}
          </option>
        ))}
      </select>

      {preset === 'custom' && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="RRULE e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR"
          aria-label="Custom recurrence rule (RRULE)"
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1.5 font-mono text-[11px] text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        />
      )}

      {value && (
        <span className="text-[11px] text-muted-foreground">{labelForRRule(value)}</span>
      )}
    </div>
  )
}
