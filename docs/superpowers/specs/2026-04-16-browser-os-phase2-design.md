# Nexus OS — Phase 2: Window Manager Hardening

**Date:** 2026-04-16
**Scope:** Phase 2 of 4. Adds edge-snap tiling, keyboard shortcuts, app launcher search, and window state persistence. No new apps — this phase hardens the OS shell built in Phase 1.

**What this phase does NOT include:** New apps (Phase 3), desktop icons, right-click context menus, lock screen, boot animation, notification system (Phase 4).

---

## 1. Edge-Snap Tiling

When a user drags a window's title bar near a screen edge, the window snaps into a tiled position.

### Snap Zones

| Cursor position | Snap behavior | Window state |
|---|---|---|
| Within 20px of left edge | Fill left 50% of desktop | `snapped-left` |
| Within 20px of right edge | Fill right 50% of desktop | `snapped-right` |
| Within 20px of top edge | Maximize | `maximized` (reuses existing action) |

### Snap Preview

While dragging, if the cursor enters a snap zone, a translucent preview overlay appears showing where the window will land. This preview is driven entirely by Framer Motion `useMotionValue` and `useTransform` — not React state — to avoid layout thrashing from frequent pointer events during drag.

The preview is a single `<div>` in `Desktop.jsx` that's normally invisible. Its position/size are computed from the cursor's motion values:
- Cursor near left edge → preview shows `left: 0, top: 0, width: 50%, height: calc(100% - 48px)` with a semi-transparent cyan fill
- Cursor near right edge → preview shows `left: 50%, top: 0, width: 50%, height: calc(100% - 48px)`
- Cursor near top edge → preview shows full desktop area
- Cursor not near any edge → preview opacity = 0

### Snap Behavior

On drag end inside a snap zone:
1. Save current position/size to `restoredRect`
2. Set `state` to `snapped-left` or `snapped-right`
3. Position and size are NOT stored as absolute pixels — the Window component renders snapped state using CSS percentage-based layout (`width: 50%`, `height: calc(100% - 48px)`, `left: 0` or `left: 50%`). This ensures correct behavior on browser resize.

On dragging away from a snapped state:
1. Restore to `normal` state using `restoredRect`
2. Free drag resumes

### Framer Motion Coordination

When a window enters snapped/maximized state, free dragging must be disabled (`drag={false}`) to prevent the Framer Motion internal position from conflicting with the CSS-computed layout. Dragging is only enabled in `normal` state. To "tear" a window out of a snap, the user clicks and drags the title bar — the first pointer-down in a snapped state calls `restoreWindow` and re-enables drag.

### Store Changes

New action: `snapWindow(windowId, side)` where `side` is `'left'` or `'right'`.

```
snapWindow(windowId, side):
  - Save current {position, size} to restoredRect
  - Set state to `snapped-left` or `snapped-right`
  - Position/size fields are set to sentinel values (e.g., {x: 0, y: 0} for left,
    {x: -1, y: 0} for right) — the Window component ignores these and uses CSS
    when state is a snapped variant
```

### Files Changed

| File | Change |
|---|---|
| `frontend/src/os/stores/windowStore.js` | Add `snapWindow` action |
| `frontend/src/os/components/Window.jsx` | CSS percentage rendering for snapped states, disable drag when snapped, title-bar tear-away logic |
| `frontend/src/os/Desktop.jsx` | Add snap preview overlay div, pass motion values to Window for edge detection |

---

## 2. Keyboard Shortcuts

Global keyboard shortcuts using `Alt` (Windows) / `Option` (Mac) as the Nexus modifier key. This avoids conflicts with browser-reserved shortcuts (`Cmd+W`, `Cmd+Tab`, etc.).

### Shortcut Map

| Shortcut | Action |
|---|---|
| `Alt + W` | Close active window |
| `Alt + M` | Minimize active window |
| `Alt + Up` | Maximize / restore active window (toggle) |
| `Alt + Left` | Snap active window to left half |
| `Alt + Right` | Snap active window to right half |
| `Alt + [` | Cycle focus to previous window in zStack |
| `Alt + ]` | Cycle focus to next window in zStack |
| `Alt + 1` through `Alt + 8` | Open/focus app by position in `APP_ORDER` |
| `Alt + L` | Toggle app launcher |
| `Cmd/Ctrl + K` | Toggle AI Command Palette (unchanged — stays inside Media Vault) |

### Focus Cycling

`Alt + ]` (next): Find the current `activeWindowId` in `zStack`, move to the next entry (wrapping to start). Call `focusWindow` on it.

`Alt + [` (previous): Same logic, move to the previous entry (wrapping to end).

Skip minimized windows during cycling — only focus visible windows.

### Implementation

New file: `frontend/src/os/hooks/useGlobalShortcuts.js`

A custom hook that:
1. Sets up a single `keydown` listener on `document`
2. Checks `e.altKey` + `e.key` (or `e.code` for arrow keys)
3. Calls `e.preventDefault()` for matched shortcuts
4. Dispatches the corresponding store action
5. Cleans up listener on unmount

Called from `Desktop.jsx`: `useGlobalShortcuts()`

### Files Changed

| File | Change |
|---|---|
| `frontend/src/os/hooks/useGlobalShortcuts.js` | New file — keyboard shortcut handler |
| `frontend/src/os/Desktop.jsx` | Import and call `useGlobalShortcuts()` |
| `frontend/src/os/stores/windowStore.js` | Add `cycleWindow(direction)` action for next/prev focus cycling |

---

## 3. App Launcher Search

Add a text filter to the AppLauncher so users can type to find apps by name.

### Behavior

- Text input at the top of the launcher, below the `// Applications` heading
- **Auto-focus on desktop only** — when `isMobile` is `false`, the input gets `autoFocus`. On mobile, the user taps it manually (avoids summoning the virtual keyboard on launcher open)
- Typing filters `APP_ORDER` by case-insensitive substring match against `manifest.title`
- Empty input shows all 8 apps
- First matching app tile gets a highlighted border (visual "active" indicator)
- Press `Enter` → launches the first filtered result (Spotlight-style)
- Press `Escape` → closes launcher (existing behavior)
- Filter state is local `useState` in `AppLauncher.jsx` — not in Zustand (ephemeral UI state)
- Filter resets to empty string each time the launcher opens

### Styling

- Input: cyberpunk monospace, `glass-panel` background, neon border on focus
- Active (first result) tile: brighter border glow, `ring-1 ring-primary/40`
- No results: show `NO_MATCHES_FOUND` in monospace with a muted icon

### Files Changed

| File | Change |
|---|---|
| `frontend/src/os/components/AppLauncher.jsx` | Add search input, filter logic, Enter-to-launch, active tile highlight |

---

## 4. Window State Persistence

Save the window layout to `localStorage` so it survives page refresh and browser close.

### What Gets Persisted

- All open windows: `appId`, `position`, `size`, `state` (normal/maximized/snapped-left/snapped-right)
- `zStack` order
- `activeWindowId`
- Schema version number (for migration/discard on mismatch)

### What Does NOT Get Persisted

- Minimized windows — restored as `normal` on hydration (invisible windows on reload are confusing)
- Multi-instance `windowId` values — regenerated with fresh `nanoid` on hydration
- `isMobile` flag — re-detected from `matchMedia` on mount
- `launcherOpen` — always starts closed
- App-internal state (selected email, active media type, chat session) — apps own their own state

### Persistence Mechanism

A debounced (500ms) `subscribe` callback in `windowStore.js` that writes a snapshot to `localStorage` key `nexus-os:window-layout`.

**Mobile guard:** If `isMobile` is `true`, the subscriber skips saving. Mobile mode is "read-only" for spatial layout — it never overwrites the desktop arrangement.

### Hydration

On Desktop mount, `hydrateFromStorage()` is called once:

1. Read `nexus-os:window-layout` from localStorage
2. Parse JSON — if parse fails, discard and use defaults
3. Check `schemaVersion` — if it doesn't match the current version (e.g., `1`), discard and use defaults
4. **Clamp saved positions** against current `window.innerWidth` / `window.innerHeight` — prevents off-screen windows when switching monitors or screen sizes
5. **Regenerate multi-instance windowIds** — for non-singleton apps, generate new `nanoid` IDs and update `zStack` references accordingly
6. **Convert minimized states** to `normal`
7. Apply to store via `setState`
8. If no saved layout or layout was discarded → fall back to opening Media Vault (existing default behavior)

### Clamping Logic

For each window during hydration:
```
x = Math.min(saved.x, window.innerWidth - 100)
x = Math.max(0, x)
y = Math.min(saved.y, window.innerHeight - TASKBAR_HEIGHT - 40)
y = Math.max(0, y)
width = Math.min(saved.width, window.innerWidth * 0.95)
height = Math.min(saved.height, (window.innerHeight - TASKBAR_HEIGHT) * 0.95)
```

### Zustand Implementation

Using a manual `subscribe` + debounce rather than Zustand's `persist` middleware. Reasons:
- We need custom serialization (strip minimized, regenerate IDs)
- We need the mobile guard
- We need clamping on hydrate
- The `persist` middleware's `partialize`/`merge` could work but adds indirection for logic that's clearer as explicit code

### Files Changed

| File | Change |
|---|---|
| `frontend/src/os/stores/windowStore.js` | Add `hydrateFromStorage()` action, add debounced `subscribe` for persistence, add `SCHEMA_VERSION` constant |
| `frontend/src/os/Desktop.jsx` | Call `hydrateFromStorage()` on mount (replace or precede the current "open media if empty" logic) |

---

## 5. Dependencies

No new packages. Everything is built with existing deps:
- `zustand` (store)
- `framer-motion` (drag, motion values for snap preview)
- `nanoid` (ID regeneration on hydrate)

---

## 6. What Is NOT In Phase 2

Explicitly deferred:
- New apps — Terminal, File Manager, Settings, System Monitor, Notes (Phase 3)
- Desktop icons (Phase 4)
- Right-click context menus (Phase 4)
- Lock screen / boot animation (Phase 4)
- Notification system (Phase 4)
- Wallpaper customization (Phase 4)

---

## 7. Testing Strategy

### Unit Tests

- `windowStore.js`: Test `snapWindow`, `cycleWindow`, `hydrateFromStorage`. Test persistence subscriber (mock localStorage). Test mobile guard on save. Test clamping on hydrate.
- `useGlobalShortcuts.js`: Test that each Alt+key combo dispatches the correct store action. Test that non-Alt keys are ignored. Test focus cycling wraps around.

### Component Tests

- `Window.jsx`: Snapped state renders with CSS percentage sizing. Drag disabled when snapped. Title bar tear-away restores to normal.
- `AppLauncher.jsx`: Search input filters grid. Enter launches first result. Auto-focus only on desktop.
- `Desktop.jsx`: Snap preview overlay appears/disappears based on cursor position.

### Integration / Manual

- Drag window to left edge → snap preview appears → drop → window fills left 50%
- Drag snapped window away → restores to previous size
- Alt+Left/Right → window snaps
- Alt+] → cycles focus through windows
- Alt+1 → opens/focuses Media Vault
- Alt+L → opens launcher, type "ter" → shows Terminal, press Enter → launches
- Arrange 3 windows → refresh page → same layout restores
- Arrange windows on wide screen → resize browser to narrow → positions clamp correctly
- Open launcher on mobile → keyboard doesn't auto-appear

---

## 8. Rollback Plan

Each section is independently revertible:
- Snap tiling: `snapWindow` action + Window.jsx CSS changes can be reverted; `snapped-left/right` states fall back to `normal`
- Keyboard shortcuts: remove `useGlobalShortcuts` hook call from Desktop
- Launcher search: revert AppLauncher.jsx to the non-search version
- Persistence: remove `subscribe` and `hydrateFromStorage` — windows always start fresh

No backend changes. No database changes. No auth changes.
