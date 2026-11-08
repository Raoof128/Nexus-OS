import { useId, useState } from 'react'
import { RECURRENCE_PRESETS, buildRRule, labelForRRule } from '../lib/recurrence'

// Maps the current rrule value back to a preset key for the <select>.
function presetForValue(value) {
  if (!value) return 'none'
  const match = RECURRENCE_PRESETS.find((p) => p.rrule === value)
  return match ? match.value : 'custom'
}

export default function RecurrencePicker({ value, onChange }) {
  const selectId = useId()
  // Custom mode is sticky. Clearing the RRULE box sets the value to null, which
  // would otherwise look like "Does not repeat" and unmount the field mid-typing.
  const [customMode, setCustomMode] = useState(() => presetForValue(value) === 'custom')
  const derived = presetForValue(value)
  const preset = customMode || derived === 'custom' ? 'custom' : derived

  const handlePreset = (e) => {
    const next = e.target.value
    if (next === 'custom') {
      // Keep any existing custom rule; otherwise start an editable blank one.
      setCustomMode(true)
      onChange(value && derived === 'custom' ? value : 'FREQ=WEEKLY;BYDAY=MO')
    } else {
      setCustomMode(false)
      onChange(buildRRule(next))
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId}>Repeat</label>
      <select id={selectId} value={preset} onChange={handlePreset}>
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
          className="font-mono text-[12px]"
        />
      )}

      {value && <span className="text-[12px] text-muted-foreground">{labelForRRule(value)}</span>}
    </div>
  )
}
