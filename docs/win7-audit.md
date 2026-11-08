# Windows 7 redesign — repository audit

Date: 2026-11-08 · Base commit: `ccf24b3` (main) · Branch: `feat/windows7-aero-redesign`
Audited by the Opus orchestrator before the first change (Phase 0). The baseline below was measured,
not assumed.

## 1. Baseline

| Check                    | Result at `ccf24b3`                                                     |
| ------------------------ | ----------------------------------------------------------------------- |
| `npm run test` (Vitest)  | 34 files, **266/266 pass**                                              |
| `npm run lint`           | clean                                                                   |
| `npm run build`          | OK (index 463 kB / 133 kB gzip)                                         |
| `npm run prettier:check` | **8 files already failing** (Tasks hooks/views; pre-existing, not ours) |
| E2E / visual tests       | none existed                                                            |
| Git                      | clean working tree on `main`                                            |

## 2. UI inventory (frontend/src)

~11.7k lines of JSX across 70 components.

| Area          | Files                                                                                                                                                                                                             | Responsibility                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Entry / auth  | `App.jsx`, `main.jsx`, `context/AuthContext.jsx`, `os/apps/Auth/{AuthPanel,ResetPasswordPage}.jsx`, `components/layout/Navbar.jsx`, `components/ui/PasswordInput.jsx`                                             | Cookie-session auth gate, logon/register/reset screens |
| Shell         | `os/Desktop.jsx`, `os/components/{Window,Taskbar,AppLauncher,DesktopIcons,ContextMenu,SnapPreview,BootSequence,LockScreen,NotificationToast,NotificationCenter,CommandPalette,InstallPrompt,TitlebarOverlay}.jsx` | Window manager UI, launcher, overlays                  |
| State         | `os/stores/{windowStore,settingsStore,notificationStore,fileSystemStore,appRegistry}.js`                                                                                                                          | Zustand stores; registry is the single app list        |
| Apps          | `os/apps/{Library,Email,Chat,Tasks,Aion}/…`, `os/apps/{Notes,Terminal,FileManager,SystemMonitor,Settings}App.jsx`                                                                                                 | 10 registered apps (all lazy)                          |
| Shared UI     | `components/ui/{CyberCard,ConfirmDialog,PasswordInput}.jsx`                                                                                                                                                       | Media card, confirm dialog                             |
| Design system | `index.css` (476 lines), `index.html` (Google Fonts: Orbitron/Oxanium/JetBrains Mono)                                                                                                                             | Tailwind v4 theme + cyberpunk effects                  |

## 3. Design-system dependencies found

- Tailwind v4 `@theme` mapping shadcn-style HSL tokens (`--primary` neon yellow, `--background` black).
- Hard-coded dark utilities dominate: `text-white` ×207, `bg-white/x` ×117, `border-white/x` ×100,
  `uppercase` ×75, `heading-ui` ×69, `heading-display` ×43, `glass-panel` ×38, `font-display/ui/mono`
  ×166, cyan/amber/violet neon shades on dark (×~120), 28 arbitrary hex colours.
- CSS effects: ambient orbs, scanlines, neon-border, cyber-bracket, glitch, neon-pulse, decrypt.
- Settings store persisted `accentColor` (neon presets), `scanlinesEnabled`, `orbsEnabled`, and a
  `mesh` CSS wallpaper.
- Documentation mandating the cyberpunk look: `CLAUDE.md` (Code Style → Design), `AGENTS.md`,
  `docs/design-guidelines.md`.

**Consequence:** token swapping alone could not produce Windows 7 — window bodies must become light,
so every app file needs a markup pass (dark → light utilities), not just a palette change.

## 4. CSS collision risks with 7.css (and resolution)

| Risk                                                                                                                       | Resolution                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 7.css (unlayered) would beat every Tailwind utility                                                                        | Imported into `@layer win7`, below `utilities`                                                                              |
| 7.css styles **every** `button` / `[role=button]` (min 75×23, gradients, ::before/::after) — hundreds of icon/tile buttons | `win7-reset` layer resets _classed_ buttons; bare `<button>` or `.w7-btn` opt in; 7.css state classes exempt                |
| `input[type=checkbox]` is hidden (opacity 0) unless followed by a `<label>`                                                | Label-less checkboxes/radios restored to native controls                                                                    |
| `[role=listbox]` gets a frame + `overflow-y: scroll`; every `[role=option][aria-selected]` (even "false") turns blue       | Classed listboxes reset (EmailList, Start menu)                                                                             |
| `.window[role=dialog]` is hidden until `:target`                                                                           | Contract: never put `role="dialog"` on a `.window` element                                                                  |
| Tailwind Preflight: `border-box` everywhere, zeroed margins, `font/color: inherit` on controls, `line-height: 1.5`         | Found by the parity harness; content-box restored for 7.css roots, `line-height: normal`, range margin, control text colour |
| Portals render into `document.body`                                                                                        | `.win7` scope is on `<body>`, so portals are covered                                                                        |
| Global `:where(...):focus-visible` neon outline                                                                            | Replaced by the Win7 dotted focus rectangle                                                                                 |
| `!important` sprawl                                                                                                        | None added (only the pre-existing reduced-motion rule uses it)                                                              |

## 5. Accessibility issues found in the shell (pre-redesign)

- Launcher grid arrow keys moved in 2D while results were a list → replaced by a vertical list with
  ↑/↓/Enter/Esc and `role=listbox`/`option` + `aria-selected`.
- Taskbar buttons had no pressed state for the active window → `aria-pressed`.
- Desktop icons were not arrow-key navigable → column-major arrow navigation added.
- Notification badge colour (black on neon yellow) failed nothing but neon focus ring was the only
  focus indicator on dark glass → Win7 dotted focus rectangles throughout.
- Mobile window close target was 40×40 → 56×30 caption button on a 44px title bar.

## 6. Performance risks

- `backdrop-filter` on every window (7.css `.glass`), the taskbar and Start menu. Mitigated: 4–6px
  blur (7.css default), no blur in content; `@supports` fallbacks for the taskbar.
- 7.css adds ~84 kB raw CSS (≈10 kB gzip) — acceptable; tree-shaking per component possible later
  via `7.css/dist/gui/*`.
- The ambient-orb animation (two 500px blurred layers animating forever) and scanline overlay were
  removed — a net rendering win.
- Window drag already rAF-throttled; unchanged.

## 7. Regression-sensitive paths (must not change)

`os/stores/windowStore.js` (drag/resize/snap/persist), `Window.jsx` pointer handling, `lib/apiClient.js`
(cookie auth + silent refresh), `context/AuthContext.jsx`, `hooks/useMedia.js` (optimistic +
Realtime dedup), Email HTML sanitisation (DOMPurify) and image blocking, Tasks dnd-kit + recurrence,
Aion SSE handling, `fileSystemStore` sandbox paths, PWA (`sw.js`, manifest, share target).

## 8. Missing tests (before)

No E2E framework; no window drag/resize/snap coverage in a real browser; no visual checks; no
Start-menu keyboard tests; no mobile layout checks.

## 9. Prioritised task list (as executed)

1. Foundation: 7.css layer + reset + adapter + tokens; Segoe UI; drop Google Fonts. ✅
2. Window chrome on real 7.css markup; taskbar; Start menu; icons; desktop; wallpaper; context menu;
   snap preview; settings store (window colours). ✅
3. Design contract (`docs/win7-design-system.md`). ✅
4. Parallel app/overlay restyle by Haiku agents with disjoint file ownership. ✅ (see parity report)
5. Playwright: mocked-API fixtures, journeys, 7.css pixel-parity harness. ✅
6. Integration review, accessibility/security review, documentation updates. ✅
