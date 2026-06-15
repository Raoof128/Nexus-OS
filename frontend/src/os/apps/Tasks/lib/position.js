// Float-midpoint ordering: returns a position strictly between two neighbours
// so reordering never requires re-indexing the whole list.
export function between(prevPos, nextPos) {
  const prev = prevPos ?? null
  const next = nextPos ?? null
  if (prev !== null && next !== null) return (prev + next) / 2
  if (prev === null && next !== null) return next - 1
  if (prev !== null && next === null) return prev + 1
  return 1
}
