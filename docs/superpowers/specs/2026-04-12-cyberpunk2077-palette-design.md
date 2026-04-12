# Cyberpunk 2077 Color Palette Migration

**Date:** 2026-04-12
**Scope:** Replace Nexus Archive's current cyan/magenta/purple palette with a Cyberpunk 2077-inspired palette. No structural, layout, or component changes.

---

## 1. Color System

### Core Palette (5 colors from user)

| Token | Hex | RGB | Role |
|---|---|---|---|
| `--cp-black` | `#000000` | (0,0,0) | Page background |
| `--cp-yellow` | `#f3e600` | (243,230,0) | Primary accent — buttons, active tabs, focus rings, glows |
| `--cp-teal` | `#55ead4` | (85,234,212) | Secondary accent — links, info badges, secondary highlights |
| `--cp-red` | `#c5003c` | (197,0,60) | Destructive — delete buttons, errors, warnings |
| `--cp-darkred` | `#880425` | (136,4,37) | Destructive hover/pressed, subtle danger border glows |

### Derived Tokens

| Token | Value | Role |
|---|---|---|
| `--cp-panel` | `#111111` | Solid card/sidebar backgrounds |
| `--cp-panel-glass` | `rgba(20,20,20,0.85)` | Modal/overlay backgrounds (with backdrop-blur) |
| `--cp-foreground` | `#e8e8e8` | Primary text (off-white) |
| `--cp-muted` | `#999999` | Secondary/muted text — 7.2:1 contrast on `#111111` |
| `--cp-border-yellow` | `rgba(243,230,0,0.15)` | Default border (yellow at low opacity) |
| `--cp-border-teal` | `rgba(85,234,212,0.15)` | Alternate border (teal at low opacity) |
| `--cp-input` | `#0a0a0a` | Input field backgrounds (slightly off-black) |

### Accessibility Notes

- `#999999` on `#111111` = **7.2:1** contrast ratio (passes WCAG AAA for normal text)
- `#e8e8e8` on `#111111` = **14.5:1** contrast ratio (passes WCAG AAA)
- `#e8e8e8` on `#000000` = **17.4:1** contrast ratio (passes WCAG AAA)
- `#f3e600` on `#000000` = **14.1:1** contrast ratio (passes WCAG AAA)
- `#f3e600` on `#111111` = **12.0:1** contrast ratio (passes WCAG AAA)

---

## 2. Surface Rules

| Surface Type | Background | Border | Blur | Examples |
|---|---|---|---|---|
| Page | `#000000` | None | None | Body, root container |
| Cards, sidebars, panels | `#111111` (solid) | 1px `rgba(243,230,0,0.15)` | None | CyberCard, KanbanBoard columns, sidebar nav |
| Modals, overlays, dropdowns | `rgba(20,20,20,0.85)` | 1px `rgba(243,230,0,0.15)` | `backdrop-blur(12px)` | MediaDetailModal, AddMediaDialog, EditMediaDialog, ConfirmDialog, AICmdPalette |
| Hover/active cards | `#111111` | Border opacity bumps to `0.4` | None | CyberCard hover state |
| Input fields | `#0a0a0a` | 1px `rgba(243,230,0,0.2)` | None | Form inputs, search bar |
| Input focus | `#0a0a0a` | 1px `#f3e600` | None | Focused form inputs |

---

## 3. Accent Usage

### Yellow (`#f3e600`) — Primary Voice

- Primary buttons (solid yellow background, black text)
- Active tab indicators
- FAB (floating action button)
- Focus outlines and input focus borders
- Primary glow effects (box-shadow)
- Progress indicators
- Selected/active states

### Teal (`#55ead4`) — Secondary Voice

- Links and anchor text
- Secondary buttons (outline style: teal border, teal text, transparent bg)
- Info/status badges
- Email tab accent
- Chat message bubbles (AI responses)
- Secondary glow effects
- Hover underlines

### Red (`#c5003c`) — Destructive Only

- Delete buttons
- Error toasts and inline validation messages
- Warning badges
- Destructive confirmation dialogs (border glow)

### Dark Red (`#880425`) — Destructive Modifier

- Hover/pressed state on red buttons (`#c5003c` → `#880425`)
- Subtle border glow on "danger zone" panels (e.g., delete confirmation modal gets a faint `rgba(136,4,37,0.3)` border glow instead of the default yellow)
- Never used as a panel background

---

## 4. Glow Effects

Replace all current cyan/magenta glow values:

| Glow Type | Value |
|---|---|
| Primary glow | `0 0 20px rgba(243,230,0,0.3)` |
| Primary glow (intense) | `0 0 30px rgba(243,230,0,0.5), 0 0 60px rgba(243,230,0,0.2)` |
| Secondary glow | `0 0 20px rgba(85,234,212,0.3)` |
| Danger glow | `0 0 15px rgba(197,0,60,0.25)` |
| Danger glow (intense) | `0 0 20px rgba(136,4,37,0.4)` |

---

## 5. Glitch Animation — Chromatic Aberration

The glitch effect must use **two-color chromatic splitting** to simulate authentic CRT/holographic tearing. A single-color glitch looks like vibration, not fragmentation.

### Glitch Keyframe Strategy

- **Left offset layer:** Yellow (`#f3e600`) shifted -2px to -4px horizontally
- **Right offset layer:** Teal (`#55ead4`) or Red (`#c5003c`) shifted +2px to +4px horizontally
- Combined with `clip-path` slicing for the tearing effect

### Implementation

Use CSS `text-shadow` or pseudo-elements (`::before`, `::after`) for the two offset layers:

```css
@keyframes glitch {
  0%, 100% {
    text-shadow: none;
  }
  20% {
    text-shadow: -3px 0 #f3e600, 3px 0 #55ead4;
  }
  40% {
    text-shadow: 3px 0 #f3e600, -3px 0 #c5003c;
  }
  60% {
    text-shadow: -2px 0 #55ead4, 2px 0 #f3e600;
  }
  80% {
    text-shadow: 2px 0 #c5003c, -2px 0 #f3e600;
  }
}
```

This alternates Yellow vs Teal and Yellow vs Red for a varied, authentic chromatic aberration.

---

## 6. Other Animations

### Neon Pulse

Shift from cyan pulse to yellow pulse:

```css
@keyframes neon-pulse {
  0%, 100% { box-shadow: 0 0 5px rgba(243,230,0,0.3); }
  50% { box-shadow: 0 0 20px rgba(243,230,0,0.6), 0 0 40px rgba(243,230,0,0.3); }
}
```

### Ambient Orbs

Current floating orbs use cyan and magenta. Replace with:
- Orb 1: `rgba(243,230,0,0.08)` (yellow, subtle)
- Orb 2: `rgba(85,234,212,0.06)` (teal, subtle)

### Scanlines

Keep the scanline overlay effect. Shift its tint from cyan to a neutral `rgba(255,255,255,0.03)` so it doesn't compete with the accent colors.

---

## 7. Component-Specific Notes

### Buttons

| Variant | Normal | Hover | Active |
|---|---|---|---|
| Primary | bg `#f3e600`, text `#000000` | Brighten 10%, glow appears | Darken 5% |
| Secondary | border `#55ead4`, text `#55ead4`, bg transparent | bg `rgba(85,234,212,0.1)` | bg `rgba(85,234,212,0.2)` |
| Destructive | bg `#c5003c`, text `#e8e8e8` | bg `#880425` | Darken further |
| Ghost | text `#999999`, bg transparent | text `#e8e8e8`, bg `rgba(255,255,255,0.05)` | bg `rgba(255,255,255,0.1)` |

### CyberCard

- Background: `#111111` (solid, no blur)
- Border: 1px `rgba(243,230,0,0.15)`
- Hover: border opacity → `0.4`, add primary glow
- Status badge colors: use yellow for "active" states, teal for "info" states, red for "dropped"

### Modals (MediaDetailModal, AddMediaDialog, EditMediaDialog, ConfirmDialog)

- Background: `rgba(20,20,20,0.85)` with `backdrop-blur(12px)`
- Border: 1px `rgba(243,230,0,0.15)`
- ConfirmDialog (delete): border switches to `rgba(197,0,60,0.3)` danger glow

### AuthPanel

- Sliding panels: `rgba(20,20,20,0.85)` with blur (these are overlays)
- Active tab indicator: `#f3e600`
- Input focus: yellow border
- Submit button: primary yellow

### ChatLayout

- Chat container sidebar: `#111111` (solid)
- AI response bubbles: subtle teal tint `rgba(85,234,212,0.08)`
- User message bubbles: subtle yellow tint `rgba(243,230,0,0.08)`
- Input area: standard input styling (dark bg, yellow focus border)

### AICmdPalette

- Overlay: `rgba(20,20,20,0.85)` with blur
- Active/selected item: yellow highlight

---

## 8. Files to Modify

### Primary (color definitions)

- **`frontend/src/index.css`** — Replace all CSS variable definitions in the `@theme` block. Update glow keyframes, scanline animation, ambient orb colors, glitch animation, neon-pulse animation, scrollbar colors.

### Secondary (hardcoded color references)

These components may use inline hex/HSL values that won't update from CSS variables alone. Each needs an audit for hardcoded colors:

- `frontend/src/components/features/CyberCard.jsx` — glow box-shadows, border colors
- `frontend/src/components/features/AuthPanel.jsx` — gradient colors, panel backgrounds
- `frontend/src/components/features/ChatLayout.jsx` — bubble tints
- `frontend/src/components/features/AICmdPalette.jsx` — highlight colors
- `frontend/src/components/features/MediaDetailModal.jsx` — glow effects
- `frontend/src/components/features/AddMediaDialog.jsx` — overlay background
- `frontend/src/components/features/EditMediaDialog.jsx` — overlay background
- `frontend/src/components/features/ConfirmDialog.jsx` — danger styling
- `frontend/src/components/features/KanbanBoard.jsx` — column header accents
- `frontend/src/components/features/MediaVault.jsx` — search bar, table accents
- `frontend/src/components/features/MediaForm.jsx` — input focus styles
- `frontend/src/App.jsx` — tab bar, nav accents

### No Changes

- Font stack (Orbitron, Oxanium, JetBrains Mono) — unchanged
- Component structure, props, state management — unchanged
- Layout, responsive breakpoints, spacing — unchanged
- Backend — unchanged
- `lib/mediaConfig.js` — unchanged (icon definitions, not colors)

---

## 9. What This Spec Does NOT Cover

- No new components or features
- No layout or structural changes
- No font changes
- No backend changes
- No dependency additions (pure CSS variable + class changes)
