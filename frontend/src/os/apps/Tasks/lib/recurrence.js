// Map between UI preset choices and RRULE strings the backend understands.

export const RECURRENCE_PRESETS = [
  { value: 'none', label: 'Does not repeat', rrule: null },
  { value: 'daily', label: 'Daily', rrule: 'FREQ=DAILY' },
  { value: 'weekly', label: 'Weekly', rrule: 'FREQ=WEEKLY' },
  { value: 'monthly', label: 'Monthly', rrule: 'FREQ=MONTHLY' },
  { value: 'annually', label: 'Annually', rrule: 'FREQ=YEARLY' },
  { value: 'custom', label: 'Custom…', rrule: null },
]

export function buildRRule(presetValue) {
  const preset = RECURRENCE_PRESETS.find((p) => p.value === presetValue)
  return preset ? preset.rrule : null
}

export function labelForRRule(rrule) {
  if (!rrule) return 'Does not repeat'
  const match = RECURRENCE_PRESETS.find((p) => p.rrule === rrule)
  return match ? match.label : 'Custom'
}
