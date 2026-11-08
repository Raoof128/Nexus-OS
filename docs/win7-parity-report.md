# Windows 7 parity report

Date: 2026-11-08 · Branch: `feat/windows7-aero-redesign`
Reference: <https://khang-nd.github.io/7.css/> (hosted 7.css **v0.21.0**; Nexus bundles npm **v0.21.1**).

This report separates two questions:

1. **Component fidelity** — does every 7.css component render exactly as on the reference when it
   runs inside Nexus's real CSS stack (Tailwind v4 Preflight + `win7-reset` + `nexus` adapter)?
   Measured by automated pixel comparison.
2. **Desktop and application fidelity** — do the shell and the apps read as Windows 7? 7.css is a
   component gallery, not an OS, so there is no pixel reference for a taskbar or an email client.
   Assessed by screenshot review against the design contract.

No parity percentage is claimed beyond what the tables below measure.

## 1. Component fidelity (automated)

**Method** (`frontend/e2e/parity.spec.js`, run with `npx playwright test e2e/parity.spec.js --project=desktop`):

- Chromium headless shell 158, viewport 1280×900, deviceScaleFactor 1, light scheme, animations
  disabled, pointer parked at (0,0).
- Every `.example` on the live reference page (64 of them) is read. Its markup is mounted twice in
  an identical `.example` box at the same integer position:
  - **reference side** — a clean page loading only the hosted `7.css` + `docs.css`;
  - **Nexus side** — `frontend/win7-parity.html`, i.e. `src/index.css` (the production stack)
    plus the same `docs.css`.
- The component node (`.raw`) is screenshotted on both sides and compared with
  `pixelmatch` (threshold 0.1). Size differences are reported separately.
- Methodology controls, each verified rather than assumed:
  - Screenshotting in place on the 18,000px reference page produced a systematic 1px rounding
    error (fractional scroll offset; both nodes measured exactly 23px in the DOM), hence the clean
    reference stage.
  - Tailwind Preflight zeroes browser defaults for prose (`h1`, `p`, lists) that 7.css never
    styles; the harness restores those UA defaults _for documentation prose only_, in the `base`
    layer, so every 7.css rule still wins.
- Fonts: Segoe UI is not installed on the test machine, so **both** sides fall back identically
  (`Noto Sans` → `sans-serif`). Rendering with genuine Segoe UI on Windows was not verified.

**Result: 58 of 64 examples are pixel-identical; the other 6 differ by at most
1.842% of pixels.**

### Integration defects the harness found (all fixed)

| #   | Symptom                                                  | Cause                                                                                               | Fix (`src/index.css`)                                 |
| --- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Default/focused buttons 14px tall                        | classed-button reset stripped 7.css state classes                                                   | exempt `.default`, `.focused`, `.active`              |
| 2   | Every control 1px off                                    | Tailwind `line-height: 1.5` vs 7.css's `normal`                                                     | body `line-height: normal`                            |
| 3   | Windows, menus, balloons, status bars 2px narrow         | Preflight `border-box` vs 7.css content-box sizing                                                  | content-box for those 7.css roots (not `.nx-window`)  |
| 4   | Progress bars 2px short; `.has-shadow` list box unframed | same box-sizing issue; classed-listbox reset too broad                                              | content-box; exempt 7.css modifier classes            |
| 5   | Search box padding / cue banner wrong                    | adapter re-styled `input[type=search]` + placeholder                                                | removed (7.css owns them)                             |
| 6   | Slider offset                                            | Preflight removed the range input's 2px UA margin                                                   | restore margin                                        |
| 7   | Input text colour                                        | Preflight `color: inherit` on controls                                                              | black text on `input`/`textarea`                      |
| 8   | Group-box examples (after a later fix)                   | neutralising 7.css `.group` for Tailwind's `group` marker also hit 7.css's own lone `class="group"` | scope to elements where `group` is not the only class |

Progression of identical examples across runs: 0 → 42 → 47 → 55 → 58 (→ 54 after fix 8 was
first introduced, → 58 after scoping it).

### Remaining differences (accepted)

| Example                                              | Mismatch           | Cause                                                                                   | Decision                                     |
| ---------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| 09-button (file input)                               | 1.84%              | Preflight `font: inherit` → 12px "No file chosen" text instead of the 13.3px UA default | Keep: 12px Segoe UI matches Windows 7 better |
| 22-listbox (`select multiple`)                       | 1.36%, 2px shorter | option line-height via Preflight `font/line-height: inherit`                            | Accept                                       |
| 20-groupbox, 43-slider, 52-tree-view, 58-window-body | 0.14–0.49%         | same form-control text metrics (inputs/selects inside the examples)                     | Accept                                       |

Evidence: `docs/win7-parity/summary.json` (all 64 results) and `ref-*/ours-*/diff-*.png` for the
non-identical examples plus representative identical ones (title bar, tabs, menu, status bar,
progress bar, button).

| Example              | Section           | Reference | Nexus   | Mismatched px | Mismatch % | Status    |
| -------------------- | ----------------- | --------- | ------- | ------------- | ---------- | --------- |
| 00-scoping           | scoping           | 941×23    | 941×23  | 0             | 0          | identical |
| 01-balloon           | balloon           | 723×40    | 723×40  | 0             | 0          | identical |
| 02-balloon           | balloon           | 723×23    | 723×23  | 0             | 0          | identical |
| 03-balloon           | balloon           | 723×232   | 723×232 | 0             | 0          | identical |
| 04-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 05-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 06-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 07-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 08-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 09-button            | button            | 741×23    | 741×23  | 314           | 1.842      | differs   |
| 10-button            | button            | 741×23    | 741×23  | 0             | 0          | identical |
| 11-checkbox          | checkbox          | 741×17    | 741×17  | 0             | 0          | identical |
| 12-checkbox          | checkbox          | 741×63    | 741×63  | 0             | 0          | identical |
| 13-collapse          | collapse          | 439×14    | 439×14  | 0             | 0          | identical |
| 14-collapse          | collapse          | 439×68    | 439×68  | 0             | 0          | identical |
| 15-combobox          | combobox          | 741×118   | 741×118 | 0             | 0          | identical |
| 16-dropdown          | dropdown          | 741×20    | 741×20  | 0             | 0          | identical |
| 17-dropdown          | dropdown          | 741×20    | 741×20  | 0             | 0          | identical |
| 18-dropdown          | dropdown          | 741×20    | 741×20  | 0             | 0          | identical |
| 19-groupbox          | groupbox          | 741×94    | 741×94  | 0             | 0          | identical |
| 20-groupbox          | groupbox          | 741×107   | 741×107 | 388           | 0.489      | differs   |
| 21-groupbox          | groupbox          | 741×63    | 741×63  | 0             | 0          | identical |
| 22-listbox           | listbox           | 741×76    | 741×74  | 748           | 1.364      | differs   |
| 23-listbox           | listbox           | 741×92    | 741×92  | 0             | 0          | identical |
| 24-listbox           | listbox           | 741×92    | 741×92  | 0             | 0          | identical |
| 25-listview          | listview          | 658×80    | 658×80  | 0             | 0          | identical |
| 26-listview          | listview          | 658×114   | 658×114 | 0             | 0          | identical |
| 27-menu              | menu              | 741×198   | 741×198 | 0             | 0          | identical |
| 28-menu              | menu              | 741×212   | 741×212 | 0             | 0          | identical |
| 29-menu              | menu              | 741×133   | 741×133 | 0             | 0          | identical |
| 30-menubar           | menubar           | 661×26    | 661×26  | 0             | 0          | identical |
| 31-menubar           | menubar           | 661×26    | 661×26  | 0             | 0          | identical |
| 32-radio             | radio             | 741×34    | 741×34  | 0             | 0          | identical |
| 33-radio             | radio             | 741×54    | 741×54  | 0             | 0          | identical |
| 34-progressbar       | progressbar       | 665×17    | 665×17  | 0             | 0          | identical |
| 35-progressbar       | progressbar       | 665×17    | 665×17  | 0             | 0          | identical |
| 36-progressbar       | progressbar       | 665×17    | 665×17  | 0             | 0          | identical |
| 37-progressbar       | progressbar       | 665×17    | 665×17  | 0             | 0          | identical |
| 38-progressbar       | progressbar       | 665×17    | 665×17  | 0             | 0          | identical |
| 39-scrollbar         | scrollbar         | 639×150   | 639×150 | 0             | 0          | identical |
| 40-searchbox         | searchbox         | 741×24    | 741×24  | 0             | 0          | identical |
| 41-searchbox         | searchbox         | 741×24    | 741×24  | 0             | 0          | identical |
| 42-slider            | slider            | 741×27    | 741×27  | 0             | 0          | identical |
| 43-slider            | slider            | 741×150   | 741×150 | 344           | 0.309      | differs   |
| 44-spinner           | spinner           | 741×23    | 741×23  | 0             | 0          | identical |
| 45-tabs              | tabs              | 500×223   | 500×223 | 0             | 0          | identical |
| 46-tabs              | tabs              | 500×65    | 500×65  | 0             | 0          | identical |
| 47-textbox           | textbox           | 741×23    | 741×23  | 0             | 0          | identical |
| 48-textbox           | textbox           | 741×92    | 741×92  | 0             | 0          | identical |
| 49-textbox           | textbox           | 741×142   | 741×142 | 0             | 0          | identical |
| 50-tree-view         | tree-view         | 741×74    | 741×74  | 0             | 0          | identical |
| 51-tree-view         | tree-view         | 741×212   | 741×212 | 0             | 0          | identical |
| 52-tree-view         | tree-view         | 741×64    | 741×64  | 65            | 0.137      | differs   |
| 53-title-bar         | title-bar         | 741×29    | 741×29  | 0             | 0          | identical |
| 54-title-bar         | title-bar         | 741×115   | 741×115 | 0             | 0          | identical |
| 55-title-bar         | title-bar         | 741×29    | 741×29  | 0             | 0          | identical |
| 56-title-bar         | title-bar         | 741×29    | 741×29  | 0             | 0          | identical |
| 57-window-body       | window-body       | 741×91    | 741×91  | 0             | 0          | identical |
| 58-window-body       | window-body       | 741×313   | 741×313 | 372           | 0.16       | differs   |
| 59-status-bar        | status-bar        | 741×168   | 741×168 | 0             | 0          | identical |
| 60-glass-frame-color | glass-frame-color | 741×127   | 741×127 | 0             | 0          | identical |
| 61-glass-frame-color | glass-frame-color | 741×236   | 741×236 | 0             | 0          | identical |
| 62-glass-frame-color | glass-frame-color | 741×127   | 741×127 | 0             | 0          | identical |
| 63-dialog-box        | dialog-box        | 741×14    | 741×14  | 0             | 0          | identical |

## 2. Desktop and application review (screenshots)

Captured with `frontend/e2e/shots.spec.js` (1440×900 and 390×844, mocked API/Supabase fixtures,
test data only). Files in `docs/win7-screenshots/`.

| Surface                            | Screenshot                                                  | Observations                                                                                    | Status                                                 |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Desktop, icons, wallpaper, taskbar | desktop-media.png                                           | Aero glass frame/superbar, Start orb, glossy original icons, two-line clock, Show desktop strip | Pass                                                   |
| Start menu                         | start-menu.png, mobile-start.png                            | Two columns, programs list, search, places, Lock / Log off                                      | Pass                                                   |
| Context menu                       | context-menu.png                                            | Win7 menu with icon gutter and separators                                                       | Pass                                                   |
| Notification area flyout           | notification-center.png                                     | Light flyout above tray, empty state                                                            | Pass                                                   |
| Inactive vs active frames          | multi-window.png                                            | Inactive frame desaturated, active caption buttons glossy                                       | Pass                                                   |
| Media Vault                        | app-media.png, dialog-add-book.png, dialog-book-details.png | 7.css tabs, command bar, cards, group boxes, Win7 dialogs                                       | Pass (after dnd-kit fix)                               |
| Email                              | app-email.png, dialog-compose.png                           | Three-pane Live Mail layout, unread/starred states, compose window                              | Pass (compose footer border fixed in the parity audit) |
| AI Chat                            | app-chat.png                                                | Nav pane, empty states                                                                          | Pass; populated conversation not captured              |
| Tasks                              | app-tasks.png                                               | Nav pane, Win7 checkboxes, badges, completed section                                            | Pass (after `.group` fix)                              |
| File Manager                       | app-files.png                                               | Explorer address bar, command bar, details view, details pane                                   | Pass (after `.group` fix)                              |
| Settings                           | app-settings.png                                            | Control Panel nav, window colours, backgrounds, display size                                    | Pass (after tile-width fix)                            |
| System Monitor                     | app-sysmon.png                                              | Task Manager tabs, progress bar, group boxes, status bar                                        | Pass                                                   |
| Notes                              | app-notes.png                                               | Notepad-style editor and status bar                                                             | Pass                                                   |
| Terminal                           | app-terminal.png                                            | Command Prompt console                                                                          | Pass (after `pre` margin fix)                          |
| Aion                               | app-aion.png                                                | Command bar, cards, prompt chips                                                                | Pass; reader/chat views not captured                   |
| Logon                              | logon.png                                                   | Win7-style logon with user tile and arrow button                                                | Pass                                                   |
| Lock screen                        | lock-screen.png                                             | User tile, "Locked"                                                                             | Pass (after listener fix)                              |
| Mobile                             | mobile-media.png, mobile-start.png                          | Full-screen maximised window, superbar, Start menu                                              | Pass                                                   |

## 3. Unverified areas

- Rendering with real Segoe UI on Windows; Firefox and Safari (Chromium only).
- Live backend flows (OAuth mailbox connection, sending mail, Gemini responses, Realtime events) —
  all screenshots and journeys use mocked fixtures.
- Populated Chat conversation, Aion reader and Aion chat views, Tasks editor dialog, File Manager
  file viewer, boot sequence: implemented and covered by unit tests where they exist, but not
  screenshot-reviewed.
- Touch drag/resize on tablets (pointer-event code unchanged from before the redesign).

## 4. Follow-up audit

After this report, an all-Haiku parity audit ran with 3-vote adversarial verification. It confirmed
164 findings. Two fix passes followed. Now 149 are fixed, 11 are partly fixed, and 4 are deliberately
kept, each with its reason. Every status is in [`win7-parity-audit.md`](win7-parity-audit.md).
Screenshots in `docs/win7-screenshots/` were re-captured after the fixes.
