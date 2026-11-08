const PREFS_KEY = 'nexus-os:notes-prefs'

const DEFAULT_PREFS = { wordWrap: true, monospace: false }

/** Format > Word wrap and Format > Monospace font, kept per viewer. */
export function readNotesPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const saved = JSON.parse(raw)
    return {
      wordWrap: saved?.wordWrap !== false,
      monospace: saved?.monospace === true,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writeNotesPrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable: the preference lasts for this session only.
  }
}

/**
 * Notepad's Time/Date stamp, e.g. "9:41 PM 11/8/2026".
 * Always English (US) wording and Notepad's order, whatever the viewer's locale.
 */
export function formatDateTime(date) {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const day = date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  })
  // Some ICU builds put a narrow no-break space before AM/PM; Notepad uses a plain space.
  return `${time} ${day}`.replace(/[\u00a0\u202f]/g, ' ')
}

/** Returns the text with `insert` replacing the [start, end) selection. */
export function insertAt(text, start, end, insert) {
  return text.slice(0, start) + insert + text.slice(end)
}

/**
 * Finds `query` in `text` starting at `from`, case-insensitively, wrapping to
 * the start of the note when there is no match after `from`. Returns the match
 * index, or -1.
 */
export function findInText(text, query, from = 0) {
  if (!query) return -1
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  const forward = haystack.indexOf(needle, from)
  if (forward !== -1) return forward
  return haystack.indexOf(needle, 0)
}
