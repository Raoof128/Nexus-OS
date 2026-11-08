# Design Guidelines

Nexus OS follows a **Windows 7 Aero** design language, built on [7.css](https://khang-nd.github.io/7.css/).
The full contract — layer order, what 7.css styles automatically, helper classes, tokens and the
dark-to-light conversion table — is in [`win7-design-system.md`](./win7-design-system.md). This page
is the short version.

> The cyberpunk guidelines that used to live here (neon accents, scanlines, glitch effects,
> Orbitron/Oxanium, uppercase letter-spaced labels) were retired on 2026-11-08 and must not be
> reintroduced.

## Core aesthetic

- **Shell:** Aero glass — translucent tinted window frames and taskbar, glossy caption buttons, the
  Start orb, Explorer-style hover/selection gradients. The frame colour follows the user's
  _Window colour_ setting (`--w7-w-bg`).
- **Content:** light. Window bodies are white (`#fff`) or the dialog surface (`#f0f0f0`); text is
  near-black; headings ("main instructions") are `#1e3287`; links `#0066cc`.
- **Typography:** Segoe UI 9pt (falls back to Noto Sans / system UI). Sentence case. Monospace only
  for code, the terminal and file sizes.
- **Controls:** use 7.css markup — bare `<button>` or `.w7-btn`, plain inputs/selects/textareas,
  `<fieldset><legend>` group boxes, `<menu role="tablist">` tabs, `role="progressbar"`, tree views,
  `<table>` list views.

## Motion

- Short and functional: 120–200ms fades/translations for windows, menus and flyouts.
- No idle animation (no pulsing glows, floating orbs or glitch). Honour `prefers-reduced-motion`.

## Component checklist

- [ ] Uses 7.css markup or a `.w7-*` helper, not hand-rolled colours.
- [ ] Icon-only buttons have `aria-label` (and `title` for the tooltip).
- [ ] Visible keyboard focus (Win7 dotted rectangle or 7.css control focus).
- [ ] Works at 375px wide without horizontal scrolling; touch targets ≥ 44px on mobile.
- [ ] Copy in plain Windows sentence case; errors say what happened and what to do.
- [ ] No Microsoft logos, wallpapers, icons or bundled fonts — artwork is original.
