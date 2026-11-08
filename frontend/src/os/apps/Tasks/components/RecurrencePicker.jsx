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
    <div className="flex flex-col gap-1">
      <label htmlFor="task-recurrence">Repeat</label>
      <select id="task-recurrence" value={preset} onChange={handlePreset} aria-label="Recurrence">
        {RECURRENCE_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {preset === 'custom' && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value.trim() || null)}
          placeholder="RRULE, e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR"
          aria-label="Custom recurrence rule (RRULE)"
          className="font-mono text-[11px]"
        />
      )}

      {value && <span className="text-[11px] text-muted-foreground">{labelForRRule(value)}</span>}
    </div>
  )
}
