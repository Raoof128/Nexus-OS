// Lightweight, dependency-free natural-language date extraction for quick-add.
// Pure function: given a typed title, return { title, due } where `due` is an
// ISO yyyy-mm-dd string (local) or null. When a time is present, `due_at` is an
// offset-aware local datetime string for the API and `all_day` is false. Matched
// date/time words are stripped from the title.

import { formatLocalDateTimeWithOffset, getBrowserTimeZone } from './taskDateTime'

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

function withTime(d, hour, minute) {
  const next = new Date(d)
  next.setHours(hour, minute, 0, 0)
  return next
}

function extractTime(text, baseDate) {
  const twelveHour =
    /\b(?:at\s*)?([1-9]|1[0-2])(?::([0-5]\d))?\s*(am|pm)\b/i
  const twentyFourHour = /\bat\s+([01]?\d|2[0-3]):([0-5]\d)\b/i

  let match = text.match(twelveHour)
  if (match) {
    let hour = Number(match[1])
    const minute = Number(match[2] || '0')
    const meridiem = match[3].toLowerCase()
    if (meridiem === 'pm' && hour !== 12) hour += 12
    if (meridiem === 'am' && hour === 12) hour = 0
    return { date: withTime(baseDate, hour, minute), token: match[0] }
  }

  match = text.match(twentyFourHour)
  if (match) {
    return {
      date: withTime(baseDate, Number(match[1]), Number(match[2])),
      token: match[0],
    }
  }

  return null
}

function result(title, dueDate, timeDate) {
  const due = dueDate ? toISO(dueDate) : null
  return {
    title,
    due,
    due_at: timeDate ? formatLocalDateTimeWithOffset(timeDate) : null,
    due_timezone: timeDate ? getBrowserTimeZone() : null,
    all_day: !timeDate,
  }
}

export function parseQuickAdd(raw) {
  const text = String(raw || '').trim()
  if (!text) return result('', null, null)

  const now = new Date()
  let working = text
  let dueDate = null

  const relativeDays = working.match(/\bin\s+(\d{1,3})\s+days?\b/i)
  if (relativeDays) {
    dueDate = new Date(now)
    dueDate.setDate(dueDate.getDate() + Number(relativeDays[1]))
    working = clean(working, new RegExp(relativeDays[0], 'i'))
  }

  // "today" / "tomorrow"
  if (!dueDate) {
    for (const [word, offset] of [
      ['tomorrow', 1],
      ['today', 0],
    ]) {
      const re = new RegExp(`\\b${word}\\b`, 'i')
      if (re.test(working)) {
        dueDate = new Date(now)
        dueDate.setDate(dueDate.getDate() + offset)
        working = clean(working, re)
        break
      }
    }
  }

  // weekday names -> next future occurrence (today excluded)
  if (!dueDate) {
    for (const [word, target] of Object.entries(WEEKDAYS)) {
      const re = new RegExp(`\\b(?:next\\s+)?${word}\\b`, 'i')
      if (re.test(working)) {
        dueDate = new Date(now)
        let delta = (target - dueDate.getDay() + 7) % 7
        if (delta === 0) delta = 7
        dueDate.setDate(dueDate.getDate() + delta)
        working = clean(working, re)
        break
      }
    }
  }

  const timeBase = dueDate || now
  const time = extractTime(working, timeBase)
  if (time) {
    working = clean(working, new RegExp(time.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    dueDate ||= time.date
  }

  return result(working, dueDate, time?.date || null)
}
