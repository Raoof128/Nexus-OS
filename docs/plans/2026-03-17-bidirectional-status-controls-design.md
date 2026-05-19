# Bidirectional Status Controls

## Problem

Status progression is forward-only across all three media surfaces (CyberCard, MediaVault, MediaDetailModal). Users cannot revert an accidental status change. The `nextStatus()` logic is duplicated in all three components.

## Approach: Centralized utility + component updates (Approach B)

Chosen over:

- **A (Minimal):** Just adds `prevStatus()` but keeps duplication across 3 files.
- **C (State machine):** Over-engineered. Backend `MediaStatus` Literal already constrains valid values. All transitions between valid statuses are intentionally allowed.

## Design

### Centralized Utility

Add `getStatusNav(type, currentStatus)` to `frontend/src/lib/mediaConfig.js`. Returns `{ flow, currentIndex, prev, next }`. Replaces duplicated `nextStatus()` in all 3 components.

### Component Changes

**CyberCard** (card view): Add left chevron button before status badge. Renders only when `prev` exists. Same styling as existing right chevron.

**MediaVault** (table view): Left arrow | status label | right arrow in status column. Compact inline controls.

**MediaDetailModal** (detail view): Replace "Move to {next}" button with a clickable stepper bar:

- Diamond nodes for each status, connected by lines
- Completed steps glow cyan, future steps dim, current highlighted
- Each node is a `<button>` with `aria-label`
- Clicking any node immediately triggers `onUpdate`
- Framer Motion for transition animations
- Immediate application, no confirmation dialog (reversibility is the safety net)

### Unchanged

- **Backend**: No changes. `MediaStatus` Literal validates status strings.
- **useMedia hook**: No changes. Already handles optimistic updates and rollback.
- **Database**: No changes. CHECK constraint covers all valid values.
- **AddMediaDialog**: No changes. Already shows full dropdown.

## Files Touched

| File                                                    | Change                                        |
| ------------------------------------------------------- | --------------------------------------------- |
| `frontend/src/lib/mediaConfig.js`                       | Add `getStatusNav()`                          |
| `frontend/src/components/features/CyberCard.jsx`        | Replace `nextStatus()`, add prev button       |
| `frontend/src/components/features/MediaVault.jsx`       | Replace `nextStatus()`, add prev button       |
| `frontend/src/components/features/MediaDetailModal.jsx` | Replace advance button with clickable stepper |

4 files modified, 0 created, 0 deleted.
