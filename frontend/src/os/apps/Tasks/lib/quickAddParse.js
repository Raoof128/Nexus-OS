// Lightweight, dependency-free natural-language date extraction for quick-add.
// Pure function: given a typed title, return { title, due } where `due` is an
// ISO yyyy-mm-dd string (local) or null. Matched date words are stripped from
// the title. Times are intentionally out of scope here (set via the editor).

const WEEKDAYS = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
}

function toISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function clean(text, re) {
  return text.replace(re, '').replace(/\s+/g, ' ').trim()
}

export function parseQuickAdd(raw) {
  const text = String(raw || '').trim()
  if (!text) return { title: '', due: null }

  const now = new Date()
  const lower = text.toLowerCase()

  // "today" / "tomorrow"
  for (const [word, offset] of [
    ['tomorrow', 1],
    ['today', 0],
  ]) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    if (re.test(lower)) {
      const d = new Date(now)
      d.setDate(d.getDate() + offset)
      return { title: clean(text, re), due: toISO(d) }
    }
  }

  // weekday names -> next future occurrence (today excluded)
  for (const [word, target] of Object.entries(WEEKDAYS)) {
    const re = new RegExp(`\\b${word}\\b`, 'i')
    if (re.test(lower)) {
      const d = new Date(now)
      let delta = (target - d.getDay() + 7) % 7
      if (delta === 0) delta = 7
      d.setDate(d.getDate() + delta)
      return { title: clean(text, re), due: toISO(d) }
    }
  }

  return { title: text, due: null }
}
