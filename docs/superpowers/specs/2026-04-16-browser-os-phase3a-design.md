# Nexus OS — Phase 3a: Settings, System Monitor, Notes Apps

**Date:** 2026-04-16
**Scope:** Build 3 of the 5 new apps. All frontend-only — no backend changes. Terminal and File Manager are deferred to Phase 3b (they need backend work).

---

## 1. Settings App

A singleton app for theme customization, account info display, and OS preferences.

### Tabs

**Appearance:**

- Theme color picker: switch primary accent between preset neon colors (yellow, cyan, magenta, green, orange). Each preset updates the CSS `--primary` and `--neon-yellow` variables via `document.documentElement.style.setProperty`
- Font size toggle: compact / default / large (adjusts a `--ui-scale` CSS variable)
- Toggle scanlines overlay on/off
- Toggle ambient orbs on/off
- Persisted to `localStorage` key `nexus-os:settings`

**Account:**

- Display current user email (from `useAuth` session)
- Display session info (provider, last sign-in)
- Logout button (calls existing auth disconnect)

**About:**

- App name, version, build info
- Links to GitHub repo
- Keyboard shortcuts reference table (all `Alt+key` shortcuts)

### Architecture

- File: `frontend/src/os/apps/SettingsApp.jsx`
- State: local `useState` for active tab, `localStorage` for persisted preferences
- New store: `frontend/src/os/stores/settingsStore.js` — tiny Zustand store for theme preferences (so other components can read them). Actions: `setAccentColor(color)`, `setUiScale(scale)`, `toggleScanlines()`, `toggleOrbs()`. Hydrates from localStorage on init.
- Desktop.jsx reads `settingsStore` to conditionally render scanlines/orbs
- No backend changes

### Styling

- Sidebar navigation with tab icons (Palette, User, Info)
- Each section uses glass-panel cards
- Color picker: row of neon-colored circles with active ring indicator
- Cyberpunk aesthetic consistent with the OS

---

## 2. System Monitor App

A singleton read-only dashboard showing system health and connection status.

### Panels

**API Health:**

- Healthcheck ping to `/healthz` endpoint (existing)
- Display: status (online/offline), response time in ms, last checked timestamp
- Auto-refresh every 30 seconds
- Green/red status indicator with neon glow

**Realtime Connection:**

- Read Supabase Realtime client connection state
- Display: connected/disconnected/connecting status
- Channel count (if available from the client)
- Last event timestamp

**Session Info:**

- Current user ID, email, provider
- Session expiry time (if available from JWT)
- Active window count (from windowStore)
- Open app list with instance counts

**Performance:**

- `window.performance.memory` (Chrome only) — JS heap size/limit
- `navigator.connection` info (if available) — effective type, downlink
- Page load time from `performance.timing`
- Graceful fallback for browsers that don't expose these APIs

### Architecture

- File: `frontend/src/os/apps/SystemMonitorApp.jsx`
- Uses `useEffect` intervals for healthcheck polling (30s) and realtime status checks
- Reads `apiClient` for healthcheck fetch
- Reads `realtimeClient` for connection status
- Reads `useWindowStore` for window/app counts
- Reads `useAuth` for session info
- No backend changes (uses existing `/healthz` endpoint)

### Styling

- Grid layout: 2x2 panel grid on desktop, stacked on mobile (using `@container` queries)
- Each panel: glass-panel card with neon top accent, monospace data labels
- Status indicators: green glow (healthy), red glow (error), amber pulse (connecting)
- Numbers displayed in large Orbitron font

---

## 3. Notes App

A multi-instance markdown-capable text editor for quick notes. Persisted to localStorage.

### Features

- **Multi-instance:** Each window is a separate note (can have multiple open)
- **Title bar:** Note title editable inline (double-click window title to rename — or just put a title field inside the app)
- **Editor:** Plain textarea with monospace font, full height
- **Markdown preview:** Toggle between edit and preview mode with a button
- **Persistence:** Each note saved to `localStorage` under `nexus-os:note-{noteId}` where noteId is derived from the windowId
- **Auto-save:** Debounced 500ms save on every keystroke
- **Note list:** Not needed in Phase 3a — each note is just a window. A proper note manager can come in Phase 4.

### Architecture

- File: `frontend/src/os/apps/NotesApp.jsx`
- Props: `{ appId, windowId }` — windowId is used as the note storage key
- State: `useState` for content, `useState` for preview mode toggle
- Persistence: `useEffect` with debounced localStorage write
- Markdown rendering: Simple regex-based rendering (bold, italic, headers, code blocks, lists) — no heavy markdown library needed. Or use a lightweight approach with `dangerouslySetInnerHTML` for the preview (content is user's own notes, not external input).
- No backend changes

### Window Integration

The Window component currently passes `appId` to the app component. For Notes, we also need `windowId` so each instance can persist independently. Update `Desktop.jsx` to pass `windowId` as a prop alongside `appId`.

### Styling

- Editor: full-height textarea with `font-mono`, dark background, neon cursor
- Toolbar: small bar at top with mode toggle (Edit / Preview), character count
- Preview: rendered markdown with cyberpunk-styled headings, code blocks, and lists
- No scrollbar jank — editor and preview are the same scroll container

---

## 4. Shared Changes

### App Registry Update

In `appRegistry.js`, replace `PlaceholderApp` references for `settings`, `sysmon`, and `notes`:

```js
const SettingsApp = lazy(() => import('../apps/SettingsApp'))
const SystemMonitorApp = lazy(() => import('../apps/SystemMonitorApp'))
const NotesApp = lazy(() => import('../apps/NotesApp'))
```

### Desktop.jsx — Pass windowId to apps

Currently `Desktop.jsx` passes `<AppComponent appId={win.appId} />`. Change to:

```jsx
<AppComponent appId={win.appId} windowId={win.windowId} />
```

This is needed for Notes (multi-instance persistence) and is harmless for singleton apps that ignore it.

### New directory

```
frontend/src/os/apps/
  SettingsApp.jsx
  SystemMonitorApp.jsx
  NotesApp.jsx
```

Keep apps separate from OS components. The `os/components/` dir is for the shell (Window, Taskbar, etc.). The `os/apps/` dir is for windowed applications.

---

## 5. Dependencies

No new npm packages. Everything uses existing deps:

- `zustand` (settings store)
- `lucide-react` (icons)
- Tailwind CSS v4 (styling)
- Existing `apiClient`, `realtimeClient`, `useAuth` hooks

---

## 6. Testing Strategy

### Unit Tests

- `settingsStore.js`: Test accent color change, UI scale, toggle scanlines/orbs, localStorage hydration
- `NotesApp.jsx`: Test content save/load from localStorage, preview toggle, auto-save debounce

### Component Tests

- `SettingsApp.jsx`: Renders tabs, clicking color preset updates store, logout button present
- `SystemMonitorApp.jsx`: Renders 4 panels, healthcheck fetch mocked, displays status
- `NotesApp.jsx`: Textarea renders, typing saves to localStorage, preview mode renders content

### Manual

- Open Settings → change accent color → all windows update
- Open System Monitor → see live healthcheck status
- Open 2 Notes → type in each → refresh → both restore independently
- Toggle scanlines/orbs in Settings → Desktop background updates

---

## 7. What Is NOT In Phase 3a

- Terminal app (Phase 3b — needs backend command execution)
- File Manager app (Phase 3b — needs Supabase Storage integration)
- Note sharing/syncing (future — currently localStorage only)
- Theme import/export (future)
- Custom wallpaper images (Phase 4)
