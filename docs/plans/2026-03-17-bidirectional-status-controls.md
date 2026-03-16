# Bidirectional Status Controls — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace forward-only status progression with bidirectional controls across all three media surfaces, eliminating duplicated `nextStatus()` logic.

**Architecture:** Add a single `getStatusNav()` utility to the existing `mediaConfig.js`. All three components (`CyberCard`, `MediaVault`, `MediaDetailModal`) import it, replacing their local `nextStatus()` functions. CyberCard and MediaVault get sequential prev/next chevron buttons. MediaDetailModal gets a clickable stepper bar with Framer Motion animations.

**Tech Stack:** React, Framer Motion (already installed), Lucide React icons (already installed), Vitest

---

### Task 1: Add `getStatusNav` utility to mediaConfig.js

**Files:**
- Modify: `frontend/src/lib/mediaConfig.js:31` (append after MEDIA_CONFIG)
- Create: `frontend/src/lib/mediaConfig.test.js`

**Step 1: Write the failing test**

Create `frontend/src/lib/mediaConfig.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { getStatusNav } from './mediaConfig'

describe('getStatusNav', () => {
  it('returns prev and next for a middle status', () => {
    const nav = getStatusNav('book', 'Reading')
    expect(nav).toEqual({
      flow: ['To Read', 'Reading', 'Finished'],
      currentIndex: 1,
      prev: 'To Read',
      next: 'Finished',
    })
  })

  it('returns null prev for first status', () => {
    const nav = getStatusNav('book', 'To Read')
    expect(nav.prev).toBeNull()
    expect(nav.next).toBe('Reading')
    expect(nav.currentIndex).toBe(0)
  })

  it('returns null next for last status', () => {
    const nav = getStatusNav('anime', 'Finished')
    expect(nav.prev).toBe('Watching')
    expect(nav.next).toBeNull()
    expect(nav.currentIndex).toBe(2)
  })

  it('handles unknown status gracefully', () => {
    const nav = getStatusNav('book', 'Nonexistent')
    expect(nav.currentIndex).toBe(-1)
    expect(nav.prev).toBeNull()
    expect(nav.next).toBeNull()
  })

  it('handles unknown media type gracefully', () => {
    const nav = getStatusNav('podcast', 'Playing')
    expect(nav.flow).toEqual([])
    expect(nav.currentIndex).toBe(-1)
  })

  it('works for movie type', () => {
    const nav = getStatusNav('movie', 'Watching')
    expect(nav).toEqual({
      flow: ['To Watch', 'Watching', 'Finished'],
      currentIndex: 1,
      prev: 'To Watch',
      next: 'Finished',
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/mediaConfig.test.js`
Expected: FAIL — `getStatusNav` is not exported from `./mediaConfig`

**Step 3: Write minimal implementation**

Append to `frontend/src/lib/mediaConfig.js` after line 31 (after the closing of `MEDIA_CONFIG`):

```js
export function getStatusNav(type, currentStatus) {
  const flow = MEDIA_CONFIG[type]?.statuses || []
  const index = flow.indexOf(currentStatus)
  return {
    flow,
    currentIndex: index,
    prev: index > 0 ? flow[index - 1] : null,
    next: index >= 0 && index < flow.length - 1 ? flow[index + 1] : null,
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/mediaConfig.test.js`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/mediaConfig.js frontend/src/lib/mediaConfig.test.js
git commit -m "feat: add getStatusNav utility to mediaConfig"
```

---

### Task 2: Update CyberCard with bidirectional controls

**Files:**
- Modify: `frontend/src/components/features/CyberCard.jsx`

**Step 1: Update imports**

Replace line 2:
```jsx
import { BookOpen, ChevronRight, Film, Sparkles, Trash2 } from 'lucide-react'
```
With:
```jsx
import { BookOpen, ChevronLeft, ChevronRight, Film, Sparkles, Trash2 } from 'lucide-react'
```

Replace line 3:
```jsx
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
```
With:
```jsx
import { getStatusNav } from '../../lib/mediaConfig'
```

**Step 2: Replace nextStatus function and usage**

Delete lines 11-16 (the `nextStatus` function).

Replace line 21:
```jsx
const next = nextStatus(item.status, mediaType)
```
With:
```jsx
const { prev, next } = getStatusNav(mediaType, item.status)
```

**Step 3: Add handleRevert handler**

After `handleAdvance` (after line 27), add:
```jsx
const handleRevert = async (event) => {
  event.stopPropagation()
  if (!prev || !onUpdate) return
  await onUpdate({ mediaId: item.id, data: { status: prev } })
}
```

**Step 4: Add prev button before the next button**

Inside the actions div (line 73), before the `{next && (` block, add:
```jsx
{prev && (
  <button
    type="button"
    onClick={handleRevert}
    className="rounded-md bg-white/5 p-1 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary sm:p-1.5"
    title={`Back to ${prev}`}
    aria-label={`Back to ${prev}`}
  >
    <ChevronLeft size={14} />
  </button>
)}
```

**Step 5: Run existing tests and verify app builds**

Run: `cd frontend && npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 6: Commit**

```bash
git add frontend/src/components/features/CyberCard.jsx
git commit -m "feat: add backward status control to CyberCard"
```

---

### Task 3: Update MediaVault with bidirectional controls

**Files:**
- Modify: `frontend/src/components/features/MediaVault.jsx`

**Step 1: Update imports**

Replace line 3:
```jsx
import { ArrowLeft, BookOpen, ChevronRight, Film, Search, Sparkles, Trash2 } from 'lucide-react'
```
With:
```jsx
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Film, Search, Sparkles, Trash2 } from 'lucide-react'
```

Replace line 4:
```jsx
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
```
With:
```jsx
import { MEDIA_CONFIG, getStatusNav } from '../../lib/mediaConfig'
```

Note: Keep `MEDIA_CONFIG` imported — it's still used for `config.label`, `config.creatorLabel`, etc.

**Step 2: Replace handleAdvance with bidirectional handler**

Replace lines 30-36 (the `handleAdvance` function):
```jsx
const handleAdvance = async (event, item) => {
  event.stopPropagation()
  const statuses = config?.statuses || []
  const idx = statuses.indexOf(item.status)
  if (idx === -1 || idx >= statuses.length - 1 || !onUpdate) return
  await onUpdate({ mediaId: item.id, data: { status: statuses[idx + 1] } })
}
```
With:
```jsx
const handleStatusChange = async (event, item, newStatus) => {
  event.stopPropagation()
  if (!newStatus || !onUpdate) return
  await onUpdate({ mediaId: item.id, data: { status: newStatus } })
}
```

**Step 3: Replace status cell and actions in table rows**

Replace the Status column (lines 128-133):
```jsx
{/* Status */}
<div className="mb-1 sm:mb-0">
  <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
    {item.status}
  </span>
</div>
```
With:
```jsx
{/* Status */}
<div className="mb-1 flex items-center gap-1 sm:mb-0">
  {(() => {
    const { prev, next } = getStatusNav(mediaType, item.status)
    return (
      <>
        <button
          type="button"
          onClick={(e) => handleStatusChange(e, item, prev)}
          disabled={!prev}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary disabled:invisible"
          aria-label={prev ? `Back to ${prev}` : undefined}
        >
          <ChevronLeft size={12} />
        </button>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary">
          {item.status}
        </span>
        <button
          type="button"
          onClick={(e) => handleStatusChange(e, item, next)}
          disabled={!next}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary disabled:invisible"
          aria-label={next ? `Advance to ${next}` : undefined}
        >
          <ChevronRight size={12} />
        </button>
      </>
    )
  })()}
</div>
```

Replace the Actions column (lines 140-160) — remove the old advance button, keep only delete:
```jsx
{/* Actions */}
<div className="flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
  <button
    type="button"
    onClick={(e) => handleDelete(e, item)}
    className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
    title="Delete"
    aria-label="Delete"
  >
    <Trash2 size={12} />
  </button>
</div>
```

**Step 4: Run tests and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/features/MediaVault.jsx
git commit -m "feat: add bidirectional status controls to MediaVault table"
```

---

### Task 4: Replace MediaDetailModal advance button with clickable stepper

**Files:**
- Modify: `frontend/src/components/features/MediaDetailModal.jsx`

**Step 1: Update imports**

Replace line 3:
```jsx
import { BookOpen, ChevronRight, Film, Sparkles, Star, Trash2, X } from 'lucide-react'
```
With:
```jsx
import { BookOpen, Film, Sparkles, Star, Trash2, X } from 'lucide-react'
```

Replace line 4:
```jsx
import { MEDIA_CONFIG } from '../../lib/mediaConfig'
```
With:
```jsx
import { MEDIA_CONFIG, getStatusNav } from '../../lib/mediaConfig'
```

**Step 2: Remove old nextStatus function and advance handler**

Delete lines 15-20 (the `nextStatus` function).

Replace line 26:
```jsx
const next = item ? nextStatus(item.status, mediaType) : null
```
With:
```jsx
const statusNav = item ? getStatusNav(mediaType, item.status) : null
```

Replace lines 36-40 (the `handleAdvance` function):
```jsx
const handleAdvance = async () => {
  if (!next || !onUpdate || !item) return
  await onUpdate({ mediaId: item.id, data: { status: next } })
  onClose()
}
```
With:
```jsx
const handleStatusChange = async (newStatus) => {
  if (!newStatus || !onUpdate || !item || newStatus === item.status) return
  await onUpdate({ mediaId: item.id, data: { status: newStatus } })
}
```

**Step 3: Replace the status badge with clickable stepper**

Replace the status badge in the "Creator + Status row" (lines 103-113):
```jsx
{/* Creator + Status row */}
<div className="flex flex-wrap items-center gap-3">
  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs font-medium text-primary">
    {item.status}
  </span>
  {item.creator && item.creator !== '—' && (
    <span className="font-mono text-sm text-muted-foreground">
      {config?.creatorLabel}: {sanitize(item.creator)}
    </span>
  )}
</div>
```
With:
```jsx
{/* Creator */}
{item.creator && item.creator !== '—' && (
  <div className="font-mono text-sm text-muted-foreground">
    {config?.creatorLabel}: {sanitize(item.creator)}
  </div>
)}

{/* Status Stepper */}
{statusNav && (
  <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-4">
    {statusNav.flow.map((stepStatus, index) => {
      const isCurrent = index === statusNav.currentIndex
      const isPast = index < statusNav.currentIndex

      return (
        <div key={stepStatus} className="flex flex-1 items-center last:flex-none">
          <button
            type="button"
            onClick={() => handleStatusChange(stepStatus)}
            disabled={isCurrent}
            aria-label={isCurrent ? `Current status: ${stepStatus}` : `Change status to ${stepStatus}`}
            className="relative flex flex-col items-center group outline-none disabled:cursor-default"
          >
            <Motion.div
              whileHover={isCurrent ? {} : { scale: 1.3 }}
              whileTap={isCurrent ? {} : { scale: 0.9 }}
              className={`h-3.5 w-3.5 rotate-45 border transition-all duration-300 ${
                isCurrent
                  ? 'bg-primary border-primary/60 shadow-[0_0_12px_hsl(var(--neon-cyan)/0.6)]'
                  : isPast
                    ? 'bg-primary/30 border-primary/40'
                    : 'bg-zinc-900 border-zinc-700 group-hover:border-primary/50 group-hover:bg-primary/10'
              }`}
            />
            <span
              className={`absolute top-5 whitespace-nowrap font-mono text-[9px] uppercase tracking-widest transition-colors ${
                isCurrent
                  ? 'text-primary'
                  : isPast
                    ? 'text-primary/40'
                    : 'text-zinc-600 group-hover:text-primary/50'
              }`}
            >
              {stepStatus}
            </span>
          </button>
          {index < statusNav.flow.length - 1 && (
            <div className="relative mx-2 h-px flex-1 bg-zinc-800">
              <Motion.div
                initial={false}
                animate={{ width: isPast ? '100%' : '0%' }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="absolute inset-y-0 left-0 bg-primary/50 shadow-[0_0_6px_hsl(var(--neon-cyan)/0.4)]"
              />
            </div>
          )}
        </div>
      )
    })}
  </div>
)}
```

**Step 4: Replace the actions row — remove advance button, keep delete**

Replace lines 159-179 (the actions div):
```jsx
{/* Actions */}
<div className="flex items-center gap-2 border-t border-white/5 pt-4">
  {next && (
    <button
      type="button"
      onClick={handleAdvance}
      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20 hover:shadow-[0_0_15px_var(--color-primary)]"
    >
      <ChevronRight size={14} />
      Move to {next}
    </button>
  )}
  <button
    type="button"
    onClick={handleDelete}
    className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20"
  >
    <Trash2 size={14} />
    Delete
  </button>
</div>
```
With:
```jsx
{/* Actions */}
<div className="flex items-center gap-2 border-t border-white/5 pt-4">
  <button
    type="button"
    onClick={handleDelete}
    className="flex items-center justify-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-destructive ring-1 ring-destructive/20 transition-all hover:bg-destructive/20"
  >
    <Trash2 size={14} />
    Delete
  </button>
</div>
```

**Step 5: Run tests and build**

Run: `cd frontend && npx vitest run && npm run build`
Expected: All tests pass, build succeeds

**Step 6: Manual verification checklist**

- [ ] CyberCard: left chevron appears on non-first statuses, right chevron on non-last
- [ ] MediaVault table: arrows flank the status badge, disabled arrows are invisible
- [ ] MediaDetailModal: stepper shows all 3 statuses as diamond nodes with connecting lines
- [ ] Clicking a stepper node changes status immediately, current node glows
- [ ] Clicking backward works (e.g., Finished → Reading)
- [ ] Optimistic update is instant, server sync happens in background

**Step 7: Commit**

```bash
git add frontend/src/components/features/MediaDetailModal.jsx
git commit -m "feat: replace advance button with clickable status stepper in modal"
```

---

### Task 5: Final commit and cleanup

**Step 1: Run full test suite**

Run: `cd frontend && npx vitest run`
Expected: All tests pass

**Step 2: Run build**

Run: `cd frontend && npm run build`
Expected: Clean build, no warnings

**Step 3: Run lint**

Run: `cd frontend && npx eslint src/`
Expected: No errors related to changed files

**Step 4: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore: lint fixes for bidirectional status controls"
```
