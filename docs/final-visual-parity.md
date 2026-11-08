# Final visual parity — Nexus OS vs 7.css

Date: 2026-11-08 · Branch: `claude/funny-hamilton-kasc78` · Reference: <https://khang-nd.github.io/7.css/>

This report measures the current branch. It does not reuse older numbers; every figure below comes
from a run made for this report. Earlier reports ([`win7-parity-report.md`](win7-parity-report.md),
[`win7-parity-audit.md`](win7-parity-audit.md)) are history.

## 1. Method

| Level                | What is compared                                                                                                                                                | Tool                                                                                       | Evidence                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| A — component parity | Every `.example` on the 7.css docs page, rendered on the live reference and inside Nexus's full CSS stack (Tailwind Preflight + `win7-reset` + `nexus` adapter) | `e2e/parity.spec.js` (pixelmatch, threshold 0.1, `npm run test:parity`)                    | [`final-parity/`](final-parity/)         |
| B — shell            | Logon, desktop, Start menu, desktop context menu, active + inactive windows, Add media dialog, phone desktop + Start menu                                       | `e2e/visual.spec.js` (`toHaveScreenshot`, `maxDiffPixelRatio` 0.01, `npm run test:visual`) | `frontend/e2e/visual.spec.js-snapshots/` |
| C — applications     | All 10 registered app windows at 1366×768                                                                                                                       | same                                                                                       | same                                     |

Environment: Chromium (Playwright) on Linux, deviceScaleFactor 1, 1280×900 (parity) / 1366×768 and
390×844 (visual), UTC clock frozen, reduced motion, animations disabled, fonts and images settled.
The container has no Segoe UI, so text renders in the `Noto Sans` fallback on both sides of every
comparison.

**Version check.** The hosted reference serves 7.css v0.21.0; the npm package is v0.21.1. With the
banner stripped the two files are byte-identical (same SHA-256), so every difference below is
caused by Nexus, not by a reference mismatch.

## 2. Level A — 7.css component parity

| Run                                              | Examples | Pixel-identical | Over 0.5% | Size mismatches |
| ------------------------------------------------ | -------- | --------------- | --------- | --------------- |
| Before this audit (fresh run on `c4c5434`)       | 64       | 58              | 1         | 0               |
| After (two consecutive runs on the final branch) | 64       | **62**          | 1         | 0               |

Every remaining difference, with its measured root cause:

| Example                        | Mismatch | Root cause                                                                                                       | Decision                                                                                              |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 09-button (file input)         | 1.572%   | Preflight `font: inherit` gives the "No file chosen" text 12px Segoe/Noto instead of the 13.33px UA control font | **Intentional.** Segoe UI 9pt is the design contract; 12px is closer to Windows 7 than the UA default |
| 22-listbox (`select multiple`) | 0.007%   | Sub-pixel anti-aliasing after the colour fix; no property differs                                                | **Accepted noise.** No `select multiple` is used in the app                                           |

Fixed in this audit (commit `92cf959`), each taken to 0% and re-measured twice:

| Example                     | Was            | Root cause                                                                                    | Fix                                                             |
| --------------------------- | -------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 20-groupbox, 58-window-body | 0.465%, 0.154% | Preflight's universal `padding: 0` removed the UA 2px legend inset                            | `.win7 fieldset > legend { padding-inline: 2px }`               |
| 43-slider                   | 0.309%         | `win7-reset` margin beat 7.css's `.is-vertical` margin by layer order; ranges were border-box | Rule moved to `@layer base` with `box-sizing: content-box`      |
| 22-listbox                  | 0.199%         | Preflight `select { color: inherit }` gave `#222`, not black                                  | `select[multiple]` added to the black-text rule                 |
| 52-tree-view                | 0.141%         | Preflight border-box on `::before/::after` distorted the dotted connectors                    | `.win7 .tree-view ::before/::after { box-sizing: content-box }` |

Also fixed: the parity harness itself was flaky — the docs photo behind glass examples loaded after
the screenshot on some runs (60/62-glass-frame-color swung 0% ↔ 53%). Both stages now drop it
(`0046639`).

**Coverage gaps (not measured by Level A):** hover/focus/active/disabled states (the harness parks
the pointer on static markup); caption buttons in their class form (`.is-close` etc.; an ad-hoc check
showed 0% on four variants); app-wide scrollbars (adapter-only rule, 17px vs 7.css `.has-scrollbar`
16px). These are recorded, not claimed.

## 3. Level B and C — shell and application regression baselines

18 baselines: logon, desktop with Media Vault, Start menu, desktop context menu, inactive + active
window pair, Add media dialog, the 10 app windows (media, email, chat, terminal, files, settings,
sysmon, notes, tasks, aion), phone desktop, phone Start menu. Live System Monitor values are masked.

The suite was created during this audit (the old `test:visual` script pointed at a file that did
not exist). Its baselines were captured part-way through the fix waves, then every later fix was
checked against them:

| Check                                         | Result                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run against the baselines after all fix waves | 17/18 unchanged; **1 changed: logon**                                                                                                                                                             |
| Logon diff, reviewed                          | Only the new translucent panel behind the logon form, heading and footer (A11Y-05 contrast fix, `bd44290`) and a few-pixel tile shift from its padding. Approved; baseline refreshed in `aa2ef0f` |
| After the refresh                             | 18/18, two consecutive runs                                                                                                                                                                       |

Baselines are Linux/Chromium-specific and are not a CI gate (font rasterisation differs between
machines). Refresh: `npm run test:visual -- --update-snapshots`, then review every changed PNG.

## 4. Visual changes made in this audit

| Area                   | Change                                                                                          | Why                                                                 | Commit                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------ |
| Inactive window titles | `#383838` override removed; black text with the 7.css white halo                                | 1.54:1 on the dimmed frame; 7.css does not grey inactive titles     | `92cf959`                                  |
| Menus (`.nx-flyout`)   | 28px gutter line, 27px rows, disabled opacity 0.5                                               | Match 7.css `menu.css` (#86)                                        | `6f80bad`, `d3946c5`                       |
| Logon and lock screen  | Translucent dark panel behind text                                                              | Text measured 1.0–4.0:1 on the wallpapers; now ≥ 4.95:1 on all nine | `bd44290`                                  |
| Touch                  | 48px taskbar, 44px tray, caption buttons, Library/Email/File Manager targets on coarse pointers | WCAG 2.5.8 / design contract §5; fine-pointer desktop unchanged     | `05323f0`, `6f80bad`, `7c0fe7d`, `3405b48` |
| Snap preview           | Drawn above the dragged window                                                                  | It was hidden under it                                              | `6f80bad`                                  |
| System Monitor         | Scrollable tab strip with fade cue at 360–430px                                                 | Users tab was clipped                                               | `e95f2b6`                                  |

## 5. Intentional differences from Windows 7 / 7.css

- **File input text 12px** (09-button) — Segoe 9pt contract.
- **Logon/lock text panel** — Windows 7 drew bare shadowed text on the wallpaper; that fails WCAG
  1.4.3 on most wallpapers. The panel keeps the Aero look and passes.
- **Password reveal button** on logon — accessibility (kept from the earlier audit, #49).
- **Window landmark** — windows are `role=region` with `aria-roledescription="window"` (#98).
- **Boot** — a Windows 7 "Welcome" screen after sign-in; no pre-logon boot screen (#149).
- **System Monitor** — browsers cannot report OS CPU or RAM, so the fields read "Page CPU (est.)",
  "JS heap" and "Not reported by browsers" instead of inventing Windows numbers.

## 6. Not verified

- Real Segoe UI on Windows, and Firefox/Safari rendering (Chromium on Linux only).
- Interaction states (hover, pressed, focus) at pixel level.
- Hi-DPI (deviceScaleFactor 2) rendering.
