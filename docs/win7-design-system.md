# Nexus OS — Windows 7 Aero design system

Status: **approved contract** (2026-11-08). Supersedes the old cyberpunk guidelines.
Reference: [7.css](https://khang-nd.github.io/7.css/) v0.21.1 (MIT, `npm i 7.css`), source
[khang-nd/7.css](https://github.com/khang-nd/7.css).

Nexus OS looks and behaves like a Windows 7 desktop: Aero glass frames and taskbar, light
application windows, Segoe UI 9pt, Explorer-style lists. 7.css provides the controls; this
document covers how Nexus uses them and the shell pieces 7.css does not ship.

---

## 1. How the CSS is wired

`frontend/src/index.css` declares this layer order:

```
theme → base → win7 → win7-reset → nexus → components → utilities
```

| Layer        | Contents                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `base`       | Tailwind Preflight + Win7 tokens on `:root`                                                                                                      |
| `win7`       | `7.css/dist/7.scoped.css`, **unmodified**. Matches only under `.win7`; `<body class="win7">` (index.html) supplies that, so portals are covered. |
| `win7-reset` | Opt-outs where 7.css's element selectors would fight existing markup (see §1.1).                                                                 |
| `nexus`      | Adapter: shell (`.nx-*`) and Explorer helpers (`.w7-*`) that 7.css lacks.                                                                        |
| `utilities`  | Tailwind. **Always wins**, so no `!important` is ever needed.                                                                                    |

### 1.1 What 7.css styles automatically (and the opt-outs)

| Markup                                                        | Result                                                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `<button>` **with no class**                                  | Win7 push button (gradient, 75×23 min, blue hover glow)                                                                   |
| `<button className="w7-btn …">`                               | Same push button, plus any layout utilities you add. Add `default` for the default (pulsing) button.                      |
| `<button className="…anything else…">`                        | **Reset to bare** by `win7-reset`, so your Tailwind / `.w7-toolbtn` / `.w7-item` styling applies.                         |
| `input[type=text\|password\|email\|number\|url]`, `textarea`  | Win7 sunken field (23px high). Don't add bg/border/text-colour utilities; layout utilities (`w-full`, `flex-1`) are fine. |
| `input[type=search]`                                          | 7.css search box (24px, italic placeholder, magnifier icon while empty); the adapter adds the blue focus border.          |
| `input[type=date\|time\|datetime-local\|tel]`                 | Sunken field look added by the adapter (7.css has none), with a greyed `:disabled` state.                                 |
| `select` (single)                                             | Win7 dropdown.                                                                                                            |
| `input[type=checkbox\|radio]` **followed by `<label>`**       | 7.css drawn checkbox/radio. The input needs an `id` and the label `htmlFor`.                                              |
| checkbox/radio **without** an adjacent label                  | Native control tinted Win7 blue (adapter restores it; 7.css alone would hide it).                                         |
| `input[type=range]`                                           | Win7 slider.                                                                                                              |
| `<fieldset><legend>`                                          | Group box.                                                                                                                |
| `<menu role="tablist">` + `<button role="tab" aria-selected>` | Win7 tabs; pair with `<article role="tabpanel">`.                                                                         |
| `<ul class="tree-view">`                                      | Tree view.                                                                                                                |
| `<div role="progressbar"><div style={{width}}/></div>`        | Win7 progress bar (`.marquee`, `.paused`, `.error` variants).                                                             |
| `<table>`                                                     | List view (white, header row, `.highlighted` rows).                                                                       |
| `<a>`                                                         | Win7 link blue `#0066cc`.                                                                                                 |
| `[role=listbox]` **unclassed**                                | Bordered list box. A **classed** listbox is reset (no frame, no blanket blue on options).                                 |
| `[role=tooltip]`                                              | Balloon tip.                                                                                                              |

## 2. Tokens

Light content, glass shell. Defined on `:root` in `index.css`; exposed as Tailwind colours.

| Purpose                    | Utility / variable                        | Value                       |
| -------------------------- | ----------------------------------------- | --------------------------- |
| Window client background   | `bg-background` / `bg-white`              | `#fff`                      |
| Dialog/panel surface       | `bg-muted` / `bg-w7-surface`              | `#f0f0f0`                   |
| Primary text               | `text-foreground`                         | `#1e1e1e`                   |
| Secondary text             | `text-muted-foreground`                   | `#5c5c5c` (≥ 4.5:1 on #fff) |
| Heading (main instruction) | `text-w7-title` / `.w7-heading`           | `#003399`                   |
| Link / command blue        | `text-primary`, `text-w7-link`            | `#1773c4` / `#0066cc`       |
| Hover tint                 | `bg-accent` / `bg-w7-hover`               | `#e5f3ff`                   |
| Selection                  | `bg-w7-select`, `border-w7-select-border` | `#cce8ff` / `#99d1ff`       |
| Navigation pane            | `bg-w7-pane` / `.w7-navpane`              | `#f1f5fb`                   |
| Borders                    | `border-border`                           | `#c5cad3`                   |
| Error                      | `text-destructive`, `.w7-error`           | `#c42b1c`                   |
| Success / warning          | `text-success`, `text-warning`            | `#2e7d32` / `#9d5d00`       |
| Window frame colour        | `--w7-w-bg` (on `<body>`)                 | Settings → Window colour    |
| Taskbar height             | `--w7-taskbar-h`                          | `40px`                      |
| Title bar height           | `--w7-titlebar-h`                         | `30px`                      |
| Glass blur                 | `--w7-glass-blur`                         | `6px`                       |
| Motion                     | `--w7-motion-fast` / `--w7-motion`        | `120ms` / `200ms`           |

**Typography**: Segoe UI 9pt (12px) for all UI (`font: var(--w7-font)` / inherited from
`<body>`). Use `text-[12px]` for body UI text, `text-[13px]`–`text-[15px]` only for reading
content (email bodies, chat messages, Bible text), `.w7-heading` (12pt `#003399`, 7.css `.instruction-primary`) for a page or
dialog title, `.w7-subheading` (10pt) for group titles. Monospace (`font-mono` = Consolas) **only**
for code, terminal output and file sizes. Sentence case everywhere. **No** `uppercase`,
`tracking-*`, Orbitron/Oxanium/JetBrains Mono, letter-spaced labels or `//` prefixes.

The legacy names `font-display`, `font-ui`, `heading-display`, `heading-ui`, `glass-panel`,
`text-neon-yellow` still resolve (to Segoe UI / white panels / Win7 blue) so stale code cannot
reintroduce neon — but remove them when you touch a file.

## 3. Component recipes

| Need                           | Use                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary / dialog button        | `<button className="w7-btn">Save</button>` (`w7-btn default` for the default action)                                                                                                                                                                                                                                                                                                                                                       |
| Toolbar / icon button          | `className="w7-toolbtn"` (flat, Explorer hover). Icon-only → `aria-label` + `title`. Danger → add `w7-toolbtn--danger`.                                                                                                                                                                                                                                                                                                                    |
| Toolbar strip                  | `<div className="w7-commandbar">…</div>`                                                                                                                                                                                                                                                                                                                                                                                                   |
| Left navigation column         | `className="w7-navpane"`; items are `className="w7-item flex … px-2 py-1"` with `aria-current="page"` (or `.is-selected`) when active                                                                                                                                                                                                                                                                                                      |
| List row / tile with selection | `w7-item` + `aria-selected` / `.is-selected`                                                                                                                                                                                                                                                                                                                                                                                               |
| White sunken area              | `w7-sunken`                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Card                           | `w7-card` (white, 1px `#d9d9d9`, 3px radius, faint shadow)                                                                                                                                                                                                                                                                                                                                                                                 |
| Status / count pill            | `w7-badge`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Bottom details strip           | `w7-detailspane`, or 7.css `<div className="status-bar"><p className="status-bar-field">…</p></div>`                                                                                                                                                                                                                                                                                                                                       |
| Info / warning banner          | `w7-infobar`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Inline error                   | `<p className="w7-error" role="alert">`                                                                                                                                                                                                                                                                                                                                                                                                    |
| Tabs                           | `<menu role="tablist">` + `<button role="tab" aria-selected aria-controls>` + `<article role="tabpanel">` (§1.1)                                                                                                                                                                                                                                                                                                                           |
| Group box                      | `<fieldset><legend>Title</legend>…</fieldset>`                                                                                                                                                                                                                                                                                                                                                                                             |
| Modal dialog                   | A centred `.window.active` (`role="dialog"` must **not** be on the `.window` element — 7.css hides `.window[role=dialog]` until `:target`; put `role="dialog"` on a wrapper). Title bar with `.title-bar-text` + `.title-bar-controls` close button (`className="is-close"`, `aria-label="Close"`); body `.window-body has-space`; buttons right-aligned at the bottom: `w7-btn default` then `w7-btn`. Backdrop: `bg-black/20` (no blur). |
| Empty state                    | Centred `text-muted-foreground` sentence + one `w7-btn` action. No illustrations, no glow.                                                                                                                                                                                                                                                                                                                                                 |
| Loading                        | `<div role="progressbar" className="marquee" />` or a small spinner (`Loader2 animate-spin text-primary`) with "Loading…".                                                                                                                                                                                                                                                                                                                 |
| Icons                          | Lucide, 16px in lists/toolbars, `text-[#3d5a80]` or semantic colour. App icons: `<AppIcon appId size />`.                                                                                                                                                                                                                                                                                                                                  |

### Shell classes (owned by the shell, don't reuse in apps)

`.nx-window` (Window.jsx), `.nx-taskbar`, `.nx-taskbtn`, `.nx-start-orb`, `.nx-tray*`,
`.nx-show-desktop`, `.nx-startmenu*`, `.nx-user-tile`, `.nx-desktop-icon*`, `.nx-flyout`,
`.nx-menuitem`, `.nx-menu-separator`, `.nx-glass`, `.nx-snap-preview`, `.nx-wallpaper-aero`.
`.nx-flyout` + `.nx-menuitem` **may** be used for app context/popup menus.

## 4. Converting cyberpunk markup

| Remove                                                                                      | Replace with                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `text-white`, `text-white/80…/90`                                                           | `text-foreground`                                      |
| `text-white/40…/70`, `text-muted-foreground/xx`                                             | `text-muted-foreground`                                |
| `bg-black…`, `bg-background` on app roots, `bg-zinc-900`, `bg-gray-900`                     | nothing (window body is white) or `bg-muted`           |
| `bg-white/[0.0x]`, `bg-white/5` (subtle surfaces)                                           | `bg-muted` or `bg-w7-pane`                             |
| `hover:bg-white/…`                                                                          | `w7-item` / `w7-toolbtn`, or `hover:bg-accent`         |
| `border-white/…`, `border-cyan-…`, `border-primary/…`                                       | `border-border`                                        |
| `text-cyan-*`, `text-primary` used as neon, `text-neon-yellow`                              | `text-primary` (links/actions) or `text-w7-title`      |
| `text-{red,amber,green,violet,…}-300/400`                                                   | the `-600`/`-700` shade (readable on white)            |
| `shadow-[0_0_…rgba(0,255,255…)]`, `drop-shadow-[…]`, `neon-*`, `glitch-*`, `decrypt-effect` | delete                                                 |
| `glass-panel`, `neon-border`, `cyber-bracket*`, `backdrop-blur*` inside a window            | delete (or `w7-card` / `w7-sunken`)                    |
| `uppercase`, `tracking-*`, `font-display`, `heading-display`, `heading-ui`, `font-mono`\*   | delete (\* keep `font-mono` for code only)             |
| `rounded-xl/2xl/full` on panels and buttons                                                 | `rounded-[3px]` or none (pills/avatars may stay round) |
| `custom-scrollbar`                                                                          | delete (all scrollbars are Win7 now)                   |
| `ambient-orbs`, `scanlines`, `wallpaper-mesh` elements                                      | delete the element                                     |

**Copy**: plain Windows sentence case. `NO_MATCHES_FOUND` → "No items match your search.",
`search::applications...` → "Search programs", `// Applications` → remove, `SYSTEM_ONLINE` →
"Connected", `ACCESS DENIED` → "The password is incorrect. Try again.". Errors say what happened
and what to do. If a unit test asserts on copy you change, update the test in the same change.

## 5. Behaviour rules

- Never change data flow, hooks, stores, API calls, auth, React Query keys, optimistic updates or
  Realtime handling while restyling. Visual changes only, unless fixing a real bug (note it).
- Never use `dangerouslySetInnerHTML` or inject HTML strings (existing DOMPurify paths stay as is).
- Keep every existing `aria-*`, `data-testid`, keyboard handler and focus trap. Icon-only buttons
  need `aria-label`. Visible focus: Win7 dotted outline is global; don't add `outline-none`
  without a replacement.
- Motion: subtle fades/translations ≤ 200ms; no infinite pulses/glows; respect
  `prefers-reduced-motion` (global rule already handles CSS animations).
- Hit targets ≥ 24px on desktop, ≥ 44px on touch (`@container`/`md:` breakpoints; windows use
  `container-type: inline-size`, so prefer container queries `@md:` for in-window layouts).
- No horizontal overflow at 375px wide.

## 6. Desktop shell (implemented)

| Piece         | File                             | Notes                                                                                                                                                                                        |
| ------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window chrome | `os/components/Window.jsx`       | 7.css `.window.glass` + `.title-bar` + `.title-bar-controls` (`is-minimize/maximize/restore/close`), `.active` when focused, inactive frames desaturated. Drag/resize/snap engine unchanged. |
| Taskbar       | `os/components/Taskbar.jsx`      | 40px Aero superbar; launch-order buttons with glass states; click active → minimise; tray, 2-line clock, Show Desktop (toggles).                                                             |
| Start orb     | `os/components/StartOrb.jsx`     | Original "N" monogram (no Microsoft logo).                                                                                                                                                   |
| Start menu    | `os/components/AppLauncher.jsx`  | Programs list + "Search programs", glass right column (user tile, places, Lock, Log off). ↑/↓/Enter/Esc.                                                                                     |
| App icons     | `os/components/AppIcon.jsx`      | Original glossy SVG tiles from registry `tint`; manila folder for Files.                                                                                                                     |
| Desktop icons | `os/components/DesktopIcons.jsx` | 48px icons, column-major grid, Explorer hover/selection, arrow-key navigation.                                                                                                               |
| Context menu  | `os/components/ContextMenu.jsx`  | `.nx-flyout` + `.nx-menuitem` with icon gutter.                                                                                                                                              |
| Snap preview  | `os/components/SnapPreview.jsx`  | Aero Snap glass outline.                                                                                                                                                                     |
| Wallpaper     | `public/wallpapers/aero.svg`     | Original artwork. W1–W8 user wallpapers remain selectable.                                                                                                                                   |
| Window colour | `os/stores/settingsStore.js`     | `ACCENT_PRESETS` = Win7 window colours → `--w7-w-bg` on `<body>`. Old values migrate to `sky`.                                                                                               |

## 6a. Accepted differences from Windows 7

- **Password reveal** on the logon and lock password boxes is kept for accessibility, as a small
  `.w7-toolbtn` inside the field. Windows 7 has no reveal control.
- **Focused push buttons pulse**, exactly as 7.css does (`button:focus` shares the `.default` rule).
- **Windows keep `role="region"`** with `aria-roledescription="window"`, so assistive tech announces
  "window" and tests can still find a window by its name. Never put `role="dialog"` on a `.window`.
- **Lock screen** checks the account password against `/auth/login` (`AuthContext.verifyPassword`).
  Global shortcuts are off while it is shown.
- **Menu access keys** (`&Open` in menu models) are underlined only after keyboard use, as Windows 7
  does by default. The underline is the `.nx-accel` class, revealed by `body.nx-kbd-cues`.
- **Message boxes that lose work** (discard a message, close all windows) make Cancel the default
  button: `ConfirmDialog defaultAction="cancel"`.
- **Task Manager memory** shows what browsers expose (JS heap, approximate `deviceMemory`). Physical
  memory in use is labelled as not reported, not invented.

## 7. Licensing

7.css is MIT-licensed and bundled from npm. Segoe UI is referenced by name only (used when the
viewer's OS has it; falls back to Noto Sans / system UI) — no font files are shipped. No
Microsoft logos, wallpapers, icons or sounds are included; all artwork here is original.
