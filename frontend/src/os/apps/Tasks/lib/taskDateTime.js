function offsetSuffix(date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

function offsetSuffixForMinutes(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  return `${sign}${hours}:${minutes}`
}

function numericPart(parts, type) {
  return Number(parts.find((part) => part.type === type)?.value)
}

function offsetMinutesForTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const asUTC = Date.UTC(
    numericPart(parts, 'year'),
    numericPart(parts, 'month') - 1,
    numericPart(parts, 'day'),
    numericPart(parts, 'hour'),
    numericPart(parts, 'minute'),
    numericPart(parts, 'second'),
  )
  return Math.round((asUTC - date.getTime()) / 60_000)
}

export function formatLocalDateTimeWithOffset(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}:00${offsetSuffix(date)}`
}

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getSupportedTimeZones() {
  const required = ['UTC', getBrowserTimeZone()]
  let zones
  if (typeof Intl.supportedValuesOf === 'function') {
    zones = Intl.supportedValuesOf('timeZone')
  } else {
    zones = [
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Asia/Dubai',
      'Asia/Karachi',
      'Asia/Kolkata',
      'Asia/Tokyo',
      'Australia/Sydney',
    ]
  }
  return Array.from(new Set([...required, ...zones])).filter(Boolean)
}

export function localDateTimeFromParts(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export function formatDateTimeInTimeZone(dateValue, timeValue, timeZone) {
  if (!dateValue || !timeValue) return null
  const [year, month, day] = dateValue.split('-').map(Number)
  const [hour, minute] = timeValue.split(':').map(Number)
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) {
    return null
  }

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  const firstOffset = offsetMinutesForTimeZone(utcGuess, timeZone)
  const instant = new Date(utcGuess.getTime() - firstOffset * 60_000)
  const finalOffset = offsetMinutesForTimeZone(instant, timeZone)

  return `${dateValue}T${String(hour).padStart(2, '0')}:${String(minute).padStart(
    2,
    '0',
  )}:00${offsetSuffixForMinutes(finalOffset)}`
}

export function timeValueInTimeZone(dateTimeValue, timeZone) {
  if (!dateTimeValue) return ''
  const date = new Date(dateTimeValue)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = parts.find((part) => part.type === 'hour')?.value
  const minute = parts.find((part) => part.type === 'minute')?.value
  return hour && minute ? `${hour}:${minute}` : ''
}
