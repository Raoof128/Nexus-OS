# Nexus OS — Phase 1: OS Shell + Window Manager

**Date:** 2026-04-16
**Scope:** Phase 1 of 4. Replaces the tab-based SPA with a desktop environment. Media Vault, Email, and Chat render inside draggable, resizable windows. Taskbar at the bottom. Mobile falls back to full-screen app switcher with bottom dock.

**What this phase does NOT include:** Terminal, File Manager, Settings, System Monitor, Notes apps (Phase 3), desktop icons, right-click context menus, lock screen, boot animation (Phase 4), snapping/tiling (Phase 2).

---

## 1. Overall Vision

Nexus Archive becomes a cyberpunk browser OS. The current tab navigation is replaced by a windowed desktop environment where each feature (Media, Email, Chat, and future apps) runs as a standalone "application" inside a managed window.

**Phased rollout:**
- **Phase 1** (this spec): OS shell, window manager, taskbar, app launcher. Migrate 3 existing apps into windows.
- **Phase 2**: Full app framework hardening, edge-snap tiling, migrate all window behaviors, define app lifecycle contract.
- **Phase 3**: Build 5 new apps (Terminal, File Manager, Settings, System Monitor, Notes).
- **Phase 4**: Polish — lock screen, boot sequence, desktop icons, context menus, notification system, wallpaper customization.

Each phase gets its own spec after the previous one ships.

---

## 2. New File Structure

```
frontend/src/os/
  Desktop.jsx                   # Root OS component (replaces post-auth App.jsx render)
  stores/
    windowStore.js              # Zustand kernel — window state, z-stack, focus, mobile
    appRegistry.js              # Static app manifest definitions
  components/
    Window.jsx                  # Draggable/resizable window frame
    Taskbar.jsx                 # Bottom bar — launcher, app tabs, system tray
    AppLauncher.jsx             # Start menu — grid of app icons
```

**Existing files modified:**
- `App.jsx` — post-auth render delegates to `<Desktop />` instead of tab layout
- `index.html` — add `<div id="modal-root"></div>` for portal targets
- `KanbanBoard.jsx`, `MediaVault.jsx` — container query migration
- `EmailInbox.jsx` — container query migration
- `ChatLayout.jsx` — container query migration
- `AddMediaDialog.jsx`, `EditMediaDialog.jsx`, `MediaDetailModal.jsx`, `ConfirmDialog.jsx`, `ComposeModal.jsx` — portal to `#modal-root`

**No backend changes.**

---

## 3. Window Store (Zustand Kernel)

File: `frontend/src/os/stores/windowStore.js`

### State Shape

```js
{
  // Plain object, NOT a Map (avoids Zustand reactivity issues with Map references)
  windows: {
    [windowId]: {
      windowId: string,         // unique ID ("media" for singletons, "term-3a8f" for instances)
      appId: string,            // references appRegistry key
      title: string,            // title bar text
      position: { x: number, y: number },
      size: { width: number, height: number },
      minSize: { width: number, height: number },  // from app manifest
      state: 'normal' | 'minimized' | 'maximized' | 'snapped-left' | 'snapped-right',
      restoredRect: { x: number, y: number, width: number, height: number },
    }
  },

  zStack: string[],             // ordered windowIds, last = topmost
  activeWindowId: string|null,  // currently focused window
  isMobile: boolean,            // from matchMedia listener
  launcherOpen: boolean,        // app launcher overlay visibility
}
```

Note: `snapped-left` and `snapped-right` states are defined in the schema for forward-compatibility with Phase 2 tiling. Phase 1 does not implement snap behavior.

### Actions

| Action | Behavior |
|---|---|
| `openApp(appId)` | Looks up manifest in `appRegistry`. If `singleton: true` and window already exists for this `appId`, calls `focusWindow` (and `restoreWindow` if minimized). Otherwise, creates a new `WindowState` with bounded defaults: `width: Math.min(manifest.defaultSize.width, window.innerWidth * 0.8)`, same for height. Position cascaded from last opened window (+30px offset). Generates `windowId` as `appId` for singletons, `appId-${nanoid(6)}` for multi-instance. Pushes to `zStack`, sets as `activeWindowId`. |
| `closeWindow(windowId)` | Removes from `windows` and `zStack`. If `windowId === activeWindowId`, sets `activeWindowId` to the new topmost window in `zStack` (or `null` if none remain). |
| `focusWindow(windowId)` | Moves `windowId` to end of `zStack`. Sets `activeWindowId`. If minimized, calls `restoreWindow` first. |
| `minimizeWindow(windowId)` | Sets `state` to `'minimized'`. If `windowId === activeWindowId`, focus passes to next topmost visible window. |
| `maximizeWindow(windowId)` | Saves current `{position, size}` to `restoredRect`. Sets `state` to `'maximized'`. |
| `restoreWindow(windowId)` | Restores `position` and `size` from `restoredRect`. Sets `state` to `'normal'`. |
| `moveWindow(windowId, {x, y})` | Updates `position`. Clamped so at least 100px of the title bar remains within the desktop bounds (prevents losing windows off-screen). |
| `resizeWindow(windowId, {width, height})` | Updates `size`. Clamped to `minSize` floor. |
| `setMobile(bool)` | Sets `isMobile`. When `true`, all windows render full-screen; drag/resize is disabled. |
| `toggleLauncher()` | Toggles `launcherOpen`. |

### Z-Index Derivation

Each window's CSS `z-index` is its index in `zStack` + a base offset (e.g., 100). The taskbar sits at a higher fixed z-index (e.g., 500). The app launcher overlay sits above that (e.g., 600). Modal portals render at z-index 1000+.

---

## 4. App Registry

File: `frontend/src/os/stores/appRegistry.js`

A static JS object (not a store). Each entry is an `AppManifest`:

```js
{
  id: string,                   // unique key
  title: string,                // display name
  icon: LucideIconComponent,    // for taskbar and launcher
  singleton: boolean,           // true = one instance only
  defaultSize: { width, height },
  minSize: { width, height },
  component: React.lazy(() => import(...)),  // code-split per app
}
```

### Registry entries

| id | title | icon | singleton | defaultSize | minSize |
|---|---|---|---|---|---|
| `media` | Media Vault | `BookOpen` | yes | 1000 x 700 | 600 x 400 |
| `email` | Email | `Mail` | yes | 1000 x 700 | 500 x 400 |
| `chat` | AI Chat | `MessageSquare` | yes | 800 x 600 | 400 x 400 |
| `terminal` | Terminal | `TerminalSquare` | no | 700 x 450 | 400 x 250 |
| `files` | File Manager | `FolderOpen` | yes | 800 x 550 | 500 x 350 |
| `settings` | Settings | `Settings` | yes | 600 x 500 | 450 x 400 |
| `sysmon` | System Monitor | `Activity` | yes | 650 x 450 | 400 x 300 |
| `notes` | Notes | `StickyNote` | no | 600 x 500 | 350 x 300 |

All 8 apps are registered. In Phase 1, only `media`, `email`, and `chat` have real components. The other 5 render a placeholder "Coming Soon" panel. Their `component` fields still use `React.lazy` so the code-split boundary is established from day one.

Default sizes are bounded at launch time: `Math.min(manifest.defaultSize.width, window.innerWidth * 0.8)`.

---

## 5. Window Component

File: `frontend/src/os/components/Window.jsx`

### DOM Structure

```jsx
<motion.div                              // positioned absolute, drag target
  style={{ x, y, width, height, zIndex }}
  drag
  dragListener={false}                   // content drags don't move window
  dragControls={dragControls}            // controlled from title bar
  dragConstraints={desktopRef}           // passed from Desktop.jsx
  onPointerDownCapture={() => focusWindow(windowId)}  // capture phase avoids stopPropagation issues
>
  <div className="window-titlebar"
       onPointerDown={(e) => dragControls.start(e)}   // title bar is the drag handle
       onDoubleClick={toggleMaximize}                  // double-click = maximize/restore
  >
    <span><AppIcon /> {title}</span>
    <div>
      <button onClick={minimize}>—</button>
      <button onClick={toggleMaximize}>□</button>
      <button onClick={close}>✕</button>
    </div>
  </div>

  <div className="window-content"
       style={{ containerType: 'inline-size' }}        // CSS container for @container queries
  >
    <Suspense fallback={<LoadingSpinner />}>
      <AppComponent windowId={windowId} isFocused={isFocused} />
    </Suspense>
  </div>

  {/* 8 resize handles: 4 edges + 4 corners */}
  <ResizeHandle direction="n" />
  <ResizeHandle direction="s" />
  <ResizeHandle direction="e" />
  <ResizeHandle direction="w" />
  <ResizeHandle direction="ne" />
  <ResizeHandle direction="nw" />
  <ResizeHandle direction="se" />
  <ResizeHandle direction="sw" />
</motion.div>
```

### Resize Handles

Each handle is an invisible hit zone (8px wide/tall) positioned along the window border. Dragging a handle calls `resizeWindow` with updated dimensions, clamped to `minSize`. Corner handles resize in both axes. Cursor changes: `ns-resize`, `ew-resize`, `nwse-resize`, `nesw-resize`.

### State-Dependent Rendering

| Window state | Behavior |
|---|---|
| `normal` | Free drag + resize. Position/size from store. |
| `minimized` | Not rendered on desktop. Visible only as a taskbar tab. |
| `maximized` | Position locks to `(0, 0)`. Size fills desktop area (viewport height minus taskbar 48px). Drag disabled. Resize disabled. Double-click title bar or click maximize button to restore. |
| `snapped-left/right` | Phase 2 — not implemented. Falls back to `normal` if somehow set. |

### Mobile Override

When `isMobile` is `true`:
- Window renders as `fixed inset-0` (full screen)
- No drag, no resize, no resize handles
- Title bar simplified: app icon + title + close button only (no min/max)
- Bottom padding accounts for taskbar dock height

### Cyberpunk Styling

- **Title bar**: `glass-panel` (rgba(20,20,20,0.85) + backdrop-blur(12px)), neon gradient border-bottom (cyan → transparent → yellow)
- **Window border**: 1px `rgba(0,255,255,0.15)`, focused window glows brighter (`box-shadow: 0 0 20px rgba(0,255,255,0.1)`)
- **Unfocused window**: Title bar dims to 60% opacity
- **Close button**: Red glow on hover (`rgba(255,0,60,0.6)`)
- **Minimize/maximize buttons**: Cyan glow on hover
- **Content area**: `#0a0a0a` background, `overflow: hidden` (apps handle their own scrolling)
- **Fonts**: Title bar uses Oxanium (heading-ui class)

---

## 6. Taskbar

File: `frontend/src/os/components/Taskbar.jsx`

### Desktop Layout

```
[ Launcher Button | Open App Tabs ................ fill | System Tray ]
```

Fixed to bottom of viewport. Height: 48px. Full width.

- **Launcher button** (left): Orbitron "N" glyph or grid icon. Click → `toggleLauncher()`.
- **Open app tabs** (center, fills remaining space): One tab per entry in `windows` (including minimized). Each tab shows the app's icon + truncated title. Click → `focusWindow(windowId)`. Active window tab has a neon cyan underline (2px). Minimized windows have dimmed tab styling.
- **System tray** (right): Clock (HH:MM format, Oxanium font, updates every minute). Realtime connection dot (green = connected, red = disconnected — reads from existing Supabase Realtime client status). Subtle network pulse icon that animates on API activity.

### Mobile Layout

Transforms into a bottom dock: horizontally centered row of app icons (no text labels). Active app has a cyan dot indicator below its icon. Launcher button on the far left. Height: 56px + safe area bottom padding (`env(safe-area-inset-bottom)`).

### Styling

- `glass-panel` background, `backdrop-blur(16px)`
- Neon border-top: 1px cyan line
- Z-index: above all windows (500)

---

## 7. App Launcher

File: `frontend/src/os/components/AppLauncher.jsx`

An overlay panel that slides up from the taskbar (Framer Motion `y` animation).

- **Grid**: 4 columns (desktop), 3 columns (mobile)
- **Each tile**: App icon (24px) + app name (Oxanium font). Glass-panel background. Hover glow. Click → `openApp(appId)` + close launcher.
- **Backdrop**: Semi-transparent dark overlay (`rgba(0,0,0,0.5)`). Click backdrop → close launcher.
- **Z-index**: Above taskbar (600).
- Search/filter bar: deferred to Phase 2.

---

## 8. Desktop Component

File: `frontend/src/os/Desktop.jsx`

The root OS component. Rendered by `App.jsx` after successful authentication.

### Responsibilities

1. **Mobile detection**: On mount, sets up `window.matchMedia('(max-width: 767px)')` listener. Calls `setMobile(true/false)` on the window store. Cleans up on unmount.
2. **Drag constraints ref**: Creates a `useRef` on the desktop area div. Passed to each `<Window>` as `dragConstraints`.
3. **Render tree**:

```jsx
<div ref={desktopRef} className="desktop">
  {/* Wallpaper — reuses existing ambient orbs + scanlines + grid from App.jsx */}
  <div className="wallpaper" />

  {/* Windows — only non-minimized, ordered by zStack */}
  {visibleWindows.map(w => (
    <Window key={w.windowId} {...w} desktopRef={desktopRef} />
  ))}

  {/* Taskbar — always visible */}
  <Taskbar />

  {/* App Launcher — conditional overlay */}
  <AnimatePresence>
    {launcherOpen && <AppLauncher />}
  </AnimatePresence>
</div>
```

4. **Default app on first load**: On mount, if no windows are open, auto-opens the Media Vault app (`openApp('media')`).

### What moves from App.jsx to Desktop.jsx

- Ambient orb animations, scanlines overlay, grid pattern
- The cyberpunk background styling
- Tab navigation logic is removed entirely (replaced by taskbar + launcher)

### What stays in App.jsx

- `AuthContext` provider wrapping
- `QueryClientProvider` wrapping
- Auth check: if no session → `<AuthPanel />`, if session → `<Desktop />`
- `ResetPasswordPage` route handling
- Sentry error boundary

---

## 9. Container Query Migration

Existing apps must respond to their window dimensions, not the browser viewport.

### Strategy

1. Each app's root element gets `h-full w-full overflow-auto` (instead of `h-screen`, `min-h-screen`, etc.)
2. The `Window.jsx` content div has `container-type: inline-size`, making it the container query context
3. Viewport breakpoints (`md:`, `lg:`) in migrated apps are replaced with Tailwind v4 container query variants (`@md:`, `@lg:`)

### Per-app changes

**KanbanBoard.jsx:**
- Remove `min-h-screen` or any viewport height classes from root
- Root becomes `h-full w-full overflow-auto`
- `md:grid-cols-3` → `@md:grid-cols-3` for column layout
- `lg:grid-cols-3` → `@lg:grid-cols-3`

**MediaVault.jsx:**
- Same pattern: strip viewport heights, use `h-full`
- Table/grid responsive breakpoints → container variants

**EmailInbox.jsx:**
- Root: `h-full` instead of `h-screen`
- 3-pane layout sidebar visibility toggle: `md:block` → `@md:block`
- Already uses flex, so width distribution should adapt naturally

**ChatLayout.jsx:**
- Root: `h-full` instead of any viewport height
- Sidebar toggle breakpoint: `md:` → `@md:`

### Apps NOT migrated in Phase 1

The 5 new apps (Terminal, File Manager, Settings, System Monitor, Notes) don't exist yet. They'll be built container-query-native in Phase 3.

---

## 10. Modal Portal Migration

### Problem

`Window.jsx` uses Framer Motion's `drag`, which applies CSS `transform` to the window element. Per CSS spec, `transform` creates a new containing block, which breaks `position: fixed` for any descendant — modals would be trapped inside the window frame.

### Solution

All existing modals and dialogs must use `createPortal` to render into a `#modal-root` div outside the OS component tree.

### Files affected

| Component | Current behavior | Change |
|---|---|---|
| `MediaDetailModal.jsx` | `fixed` overlay | Wrap return in `createPortal(jsx, document.getElementById('modal-root'))` |
| `EditMediaDialog.jsx` | `fixed` overlay | Same portal wrapping |
| `AddMediaDialog.jsx` | `fixed` overlay + FAB button | Portal the dialog overlay only; FAB stays inside the window |
| `ConfirmDialog.jsx` | `fixed` overlay | Same portal wrapping |
| `ComposeModal.jsx` | `fixed` overlay | Same portal wrapping |
| `AICmdPalette.jsx` | `fixed` overlay | Same portal wrapping |

### index.html change

Add `<div id="modal-root"></div>` as a sibling to `<div id="root"></div>`.

### Z-index

Portal-rendered modals use z-index 1000+ to sit above all windows, taskbar, and launcher.

---

## 11. Dependencies

### New

| Package | Purpose |
|---|---|
| `zustand` | Window manager state. Lightweight, no boilerplate, works with React 19. |
| `nanoid` | Generate short unique IDs for multi-instance window IDs. |

### Already installed (no changes)

- `framer-motion` — drag/resize animations
- `lucide-react` — app icons
- `@tanstack/react-query` — data fetching (untouched)
- `@supabase/supabase-js` — realtime (untouched)

### Not needed

- No CSS-in-JS library. All styling via Tailwind utility classes + existing custom CSS in `index.css`.
- No routing library. The OS is a single view; "navigation" is opening/focusing windows.

---

## 12. What Is NOT In Phase 1

Explicitly deferred to keep scope tight:

- Edge-snap tiling (Phase 2 — schema supports it, behavior not implemented)
- Keyboard shortcuts for window management (Phase 2)
- Desktop icons / right-click context menus (Phase 4)
- Lock screen / boot animation (Phase 4)
- App launcher search/filter (Phase 2)
- Virtual filesystem (Phase 3 — File Manager app)
- Notification system (Phase 4)
- Wallpaper customization (Phase 4 — Settings app)
- Window state persistence across sessions (Phase 2 — save to localStorage)

---

## 13. Testing Strategy

### Unit tests

- `windowStore.js`: Test all actions — open/close/focus/minimize/maximize/restore, singleton enforcement, ghost focus fix on close, z-stack ordering, bounded default sizes, mobile toggle.
- `appRegistry.js`: Validate all manifests have required fields.

### Component tests

- `Window.jsx`: Renders title bar, content, resize handles. Focus on pointer down. Title bar buttons trigger correct store actions.
- `Taskbar.jsx`: Renders tabs for open windows. Click focuses correct window. Active indicator on focused window.
- `AppLauncher.jsx`: Renders all registered apps. Click opens app and closes launcher.
- `Desktop.jsx`: Renders windows for non-minimized entries. Minimized windows not in DOM.

### Integration / manual

- Open Media Vault → drag window → resize → verify KanbanBoard adapts via container queries
- Open multiple apps → verify z-ordering on click
- Open singleton twice → verify it focuses existing window instead of creating new one
- Open multi-instance app (Terminal placeholder) → verify second window created with unique ID
- Resize browser to mobile → verify full-screen mode activates, dock appears
- Open modal from within a windowed app → verify it renders above all windows via portal
- Maximize → restore → verify position/size returns correctly

---

## 14. Rollback Plan

If Phase 1 causes stability issues, `App.jsx` still has the auth check as the entry point. Reverting means:
1. Restore the tab-based render in `App.jsx` (git revert the relevant commit)
2. Remove `<Desktop />` render
3. The existing apps are only modified with `h-full` and container queries — both are backward-compatible changes

The OS layer is additive. No existing backend code, database schema, auth flow, or API is modified.
