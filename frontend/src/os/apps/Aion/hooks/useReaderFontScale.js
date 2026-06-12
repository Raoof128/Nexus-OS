import { useState, useEffect, useCallback } from 'react'

// Reader text-size levels (like other Bible apps). `size` is the verse body font
// size in px; `lineHeight` is unitless. Index 1 ("M") is the original default.
export const FONT_SCALE_LEVELS = [
  { label: 'S', size: 15, lineHeight: 1.7 },
  { label: 'M', size: 17, lineHeight: 1.8 },
  { label: 'L', size: 20, lineHeight: 1.8 },
  { label: 'XL', size: 24, lineHeight: 1.7 },
  { label: 'XXL', size: 29, lineHeight: 1.65 },
]

const STORAGE_KEY = 'aion.reader.fontScale'
const DEFAULT_INDEX = 1

function readInitialIndex() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    // getItem returns null when unset; Number(null) === 0 would wrongly pass the
    // range check below, so bail to the default before converting.
    if (stored === null || stored === '') return DEFAULT_INDEX
    const raw = Number(stored)
    if (Number.isInteger(raw) && raw >= 0 && raw < FONT_SCALE_LEVELS.length) {
      return raw
    }
  } catch {
    // localStorage unavailable (SSR / private mode) — fall through to default
  }
  return DEFAULT_INDEX
}

// Persisted reader font-size control. Returns the active level plus
// increase/decrease handlers (clamped) for the A− / A+ buttons.
export function useReaderFontScale() {
  const [index, setIndex] = useState(readInitialIndex)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(index))
    } catch {
      // ignore write failures
    }
  }, [index])

  const increase = useCallback(
    () => setIndex((i) => Math.min(i + 1, FONT_SCALE_LEVELS.length - 1)),
    [],
  )
  const decrease = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  return {
    level: FONT_SCALE_LEVELS[index],
    index,
    increase,
    decrease,
    canIncrease: index < FONT_SCALE_LEVELS.length - 1,
    canDecrease: index > 0,
  }
}
