# Cyberpunk 2077 Color Palette Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current cyan/magenta/purple palette with the Cyberpunk 2077-inspired yellow/teal/red palette defined in `docs/superpowers/specs/2026-04-12-cyberpunk2077-palette-design.md`.

**Architecture:** All color tokens live in CSS variables in `frontend/src/index.css`. The `@theme` block maps CSS variables to Tailwind color utilities. Components reference these via Tailwind classes (`text-primary`, `bg-card`, etc.) which auto-update. ~16 hardcoded color values in 7 component files need manual replacement.

**Tech Stack:** Tailwind CSS v4 (CSS-first config), React 19, Framer Motion

**Spec:** `docs/superpowers/specs/2026-04-12-cyberpunk2077-palette-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/index.css` | Modify | All CSS variables, @theme block, animations, effects |
| `frontend/src/App.jsx` | Modify | 3 hardcoded color refs (grid bg, button glow, email tab shadow) |
| `frontend/src/components/features/CyberCard.jsx` | Modify | 2 hardcoded refs (hover shadow, icon drop shadow) |
| `frontend/src/components/features/MediaDetailModal.jsx` | Modify | 3 hardcoded refs (shadow glow, diamond shadow, progress line) |
| `frontend/src/components/features/AddMediaDialog.jsx` | Modify | 2 hardcoded refs (button shadow + hover) |
| `frontend/src/components/features/AICmdPalette.jsx` | Modify | 3 hardcoded refs (shadow glow, hover shadows) |
| `frontend/src/components/features/ChatLayout.jsx` | Modify | 2 refs (border/bg opacity whites — verify if they need color shift) |
| `frontend/src/components/features/KanbanBoard.jsx` | Modify | 1 ref (top border shadow glow) |

---

### Task 1: Replace CSS Variables and @theme Block

**Files:**
- Modify: `frontend/src/index.css:1-56`

This is the core change — updates ~80% of the UI automatically.

- [ ] **Step 1: Replace the @theme block (lines 3-29)**

Replace the existing `@theme` block with:

```css
@theme {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-neon-yellow: hsl(var(--neon-yellow));
  --color-neon-teal: hsl(var(--neon-teal));
  --font-display: 'Orbitron', sans-serif;
  --font-ui: 'Oxanium', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

Key changes: `--color-neon-magenta`, `--color-neon-cyan`, `--color-neon-purple` removed. Replaced by `--color-neon-yellow` and `--color-neon-teal`.

- [ ] **Step 2: Replace the :root CSS variables (lines 32-56)**

Replace the existing `:root` block with:

```css
:root {
    --background: 0 0% 0%;
    --foreground: 0 0% 91%;
    --card: 0 0% 7%;
    --card-foreground: 0 0% 91%;
    --popover: 0 0% 8%;
    --popover-foreground: 0 0% 91%;
    --primary: 56 100% 48%;
    --primary-foreground: 0 0% 0%;
    --secondary: 170 76% 63%;
    --secondary-foreground: 0 0% 0%;
    --muted: 0 0% 7%;
    --muted-foreground: 0 0% 60%;
    --accent: 56 100% 48%;
    --accent-foreground: 0 0% 0%;
    --destructive: 345 100% 39%;
    --destructive-foreground: 0 0% 91%;
    --border: 56 100% 48% / 0.15;
    --input: 0 0% 4%;
    --ring: 56 100% 48%;
    --neon-yellow: 56 100% 48%;
    --neon-teal: 170 76% 63%;
  }
```

Color mapping explanation:
- `--background: 0 0% 0%` = `#000000` (black)
- `--foreground: 0 0% 91%` = `#e8e8e8` (off-white)
- `--card: 0 0% 7%` = `#111111` (panel dark grey)
- `--primary: 56 100% 48%` = `#f3e600` (CP2077 yellow)
- `--secondary: 170 76% 63%` = `#55ead4` (CP2077 teal)
- `--muted-foreground: 0 0% 60%` = `#999999` (accessible muted text)
- `--destructive: 345 100% 39%` = `#c5003c` (CP2077 red)
- `--input: 0 0% 4%` = `#0a0a0a` (input background)
- `--border` uses yellow at 15% opacity for the thin neon border effect
- `--neon-yellow` and `--neon-teal` replace the old `--neon-cyan`, `--neon-magenta`, `--neon-purple`

- [ ] **Step 3: Run the dev server and verify the base palette loads**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` in the browser. The page background should be pure black, text off-white, and primary accent elements yellow. Some components may still reference the old `neon-cyan`/`neon-magenta` variables — that's expected and fixed in later steps.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: replace CSS variables with CP2077 palette (yellow/teal/red)"
```

---

### Task 2: Update Scrollbar, Ambient Orbs, Scanlines, and Neon Border

**Files:**
- Modify: `frontend/src/index.css:70-169`

These CSS utility classes reference the old `--neon-cyan` and `--neon-magenta` variables.

- [ ] **Step 1: Update scrollbar colors (lines 70-87)**

Replace all `hsl(var(--neon-cyan) / ...)` with `hsl(var(--neon-yellow) / ...)`:

```css
/* ── Cyberpunk scrollbar ─────────────────────────────────── */
.custom-scrollbar::-webkit-scrollbar {
  width: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--neon-yellow) / 0.25);
  border-radius: 9999px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--neon-yellow) / 0.5);
}
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--neon-yellow) / 0.25) transparent;
}
```

- [ ] **Step 2: Update ambient orbs (lines 89-129)**

Replace magenta orb with yellow, cyan orb with teal. Lower opacity per spec:

```css
/* ── Ambient background orbs ─────────────────────────────── */
.ambient-orbs {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  contain: strict;
}
.ambient-orbs::before,
.ambient-orbs::after {
  content: '';
  position: absolute;
  border-radius: 50%;
  filter: blur(120px);
  will-change: transform;
  animation: float-orb 20s ease-in-out infinite;
}
.ambient-orbs::before {
  width: 500px;
  height: 500px;
  background: hsl(var(--neon-yellow));
  opacity: 0.08;
  top: -10%;
  right: -5%;
  animation-delay: -5s;
}
.ambient-orbs::after {
  width: 600px;
  height: 600px;
  background: hsl(var(--neon-teal));
  opacity: 0.06;
  bottom: -15%;
  left: -10%;
  animation-delay: -12s;
}
```

Note: `opacity` is moved from the shared rule to each pseudo-element individually (0.08 for yellow, 0.06 for teal per spec).

- [ ] **Step 3: Update scanlines (lines 131-145)**

Replace cyan tint with neutral white per spec:

```css
/* ── Scanline overlay ────────────────────────────────────── */
.scanlines {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  contain: strict;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(255, 255, 255, 0.03) 2px,
    rgba(255, 255, 255, 0.03) 4px
  );
}
```

- [ ] **Step 4: Update neon border gradient (lines 147-169)**

Replace cyan→magenta gradient with yellow→teal:

```css
/* ── Neon glow border effect ─────────────────────────────── */
.neon-border {
  position: relative;
}
.neon-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    hsl(var(--neon-yellow) / 0.4),
    transparent 40%,
    transparent 60%,
    hsl(var(--neon-teal) / 0.3)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: update scrollbar, orbs, scanlines, neon border to CP2077 palette"
```

---

### Task 3: Update Glitch and Neon Pulse Animations

**Files:**
- Modify: `frontend/src/index.css:171-202`

- [ ] **Step 1: Replace glitch animation with chromatic aberration (lines 171-185)**

Replace the single-color glitch with the two-color chromatic split from the spec:

```css
/* ── Glitch text effect ──────────────────────────────────── */
@keyframes glitch-shift {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
  80% { transform: translateX(1px); }
}

@keyframes glitch-chromatic {
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

.glitch-hover:hover {
  animation: glitch-shift 0.3s ease-in-out, glitch-chromatic 0.3s ease-in-out;
}
```

This keeps the positional shift AND adds the chromatic aberration as a separate animation running in parallel.

- [ ] **Step 2: Replace neon pulse animation (lines 187-202)**

Shift from cyan to yellow:

```css
/* ── Neon pulse animation ────────────────────────────────── */
@keyframes neon-pulse {
  0%, 100% {
    box-shadow: 0 0 5px hsl(var(--neon-yellow) / 0.3),
                0 0 20px hsl(var(--neon-yellow) / 0.1);
  }
  50% {
    box-shadow: 0 0 10px hsl(var(--neon-yellow) / 0.5),
                0 0 40px hsl(var(--neon-yellow) / 0.15);
  }
}

.neon-pulse:hover,
.neon-pulse:focus-visible {
  animation: neon-pulse 6s ease-in-out infinite;
}
```

- [ ] **Step 3: Verify in browser**

Hover over a card that uses `glitch-hover` class and confirm the chromatic aberration shows yellow+teal and yellow+red text shadows alternating. Hover over a `neon-pulse` element and confirm yellow glow.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: chromatic aberration glitch + yellow neon pulse"
```

---

### Task 4: Update Glass Panel

**Files:**
- Modify: `frontend/src/index.css:204-220`

- [ ] **Step 1: Update glass panel to use the new panel-glass spec**

Replace the glass panel styles:

```css
/* ── Glass panel base ────────────────────────────────────── */
.glass-panel {
  position: relative;
  background: rgba(20, 20, 20, 0.85);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  border: 1px solid hsl(var(--neon-yellow) / 0.15);
}

@supports not (backdrop-filter: blur(1px)) {
  .glass-panel {
    background: hsl(var(--card) / 0.95);
  }
}
```

Changes: background uses `rgba(20,20,20,0.85)` per spec, blur reduced to 12px, saturate removed, border uses yellow at 15% opacity.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: update glass panel to CP2077 translucent dark with yellow border"
```

---

### Task 5: Update App.jsx Hardcoded Colors

**Files:**
- Modify: `frontend/src/App.jsx` (lines ~88, ~140, ~159, ~178)

- [ ] **Step 1: Read the current file**

```bash
# Read App.jsx to get exact current lines
```

Read `frontend/src/App.jsx` and locate the 3 hardcoded color references:
1. `hsl(var(--neon-cyan)/0.03)` — grid background pattern (~line 88)
2. `hsl(var(--neon-cyan)/0.02)` — grid background pattern (~line 140)
3. `var(--color-primary)` — button shadow glow (~line 159) — this one auto-updates via CSS var, verify only
4. `hsl(187_100%_42%/0.4)` — email tab shadow (~line 178)

- [ ] **Step 2: Replace grid background references**

Replace all `hsl(var(--neon-cyan)/...)` with `hsl(var(--neon-yellow)/...)` in grid background patterns.

- [ ] **Step 3: Replace email tab hardcoded HSL**

Replace `hsl(187_100%_42%/0.4)` with `hsl(var(--neon-teal)/0.4)` — this was a hardcoded cyan that should use the teal variable.

- [ ] **Step 4: Search for any remaining `neon-cyan` or `neon-magenta` references**

```bash
cd frontend && grep -rn "neon-cyan\|neon-magenta\|neon-purple" src/App.jsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "style: replace hardcoded cyan/magenta in App.jsx with CP2077 yellow/teal"
```

---

### Task 6: Update CyberCard.jsx Hardcoded Colors

**Files:**
- Modify: `frontend/src/components/features/CyberCard.jsx` (lines ~56, ~63)

- [ ] **Step 1: Read the file and locate hardcoded refs**

Read `frontend/src/components/features/CyberCard.jsx`. Find:
1. `hsl(var(--neon-cyan)/0.15)` — hover shadow (~line 56)
2. `hsl(var(--neon-cyan)/0.8)` — icon drop shadow (~line 63)

- [ ] **Step 2: Replace both references**

Replace `hsl(var(--neon-cyan)/0.15)` → `hsl(var(--neon-yellow)/0.15)` (hover shadow)
Replace `hsl(var(--neon-cyan)/0.8)` → `hsl(var(--neon-yellow)/0.8)` (icon drop shadow)

- [ ] **Step 3: Search for remaining old variable refs**

```bash
grep -n "neon-cyan\|neon-magenta\|neon-purple" frontend/src/components/features/CyberCard.jsx
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/features/CyberCard.jsx
git commit -m "style: CyberCard hover/icon shadows to CP2077 yellow"
```

---

### Task 7: Update MediaDetailModal.jsx Hardcoded Colors

**Files:**
- Modify: `frontend/src/components/features/MediaDetailModal.jsx` (lines ~69, ~129, ~153)

- [ ] **Step 1: Read the file and locate hardcoded refs**

Read `frontend/src/components/features/MediaDetailModal.jsx`. Find:
1. `rgba(56,189,248,0.08)` — shadow glow (~line 69) — this is a hardcoded RGB cyan
2. `hsl(var(--neon-cyan)/0.6)` — diamond shadow on current status (~line 129)
3. `hsl(var(--neon-cyan)/0.4)` — progress line shadow (~line 153)

- [ ] **Step 2: Replace all three references**

Replace `rgba(56,189,248,0.08)` → `rgba(243,230,0,0.08)` (yellow glow)
Replace `hsl(var(--neon-cyan)/0.6)` → `hsl(var(--neon-yellow)/0.6)` (diamond shadow)
Replace `hsl(var(--neon-cyan)/0.4)` → `hsl(var(--neon-yellow)/0.4)` (progress line)

- [ ] **Step 3: Search for remaining old refs**

```bash
grep -n "neon-cyan\|neon-magenta\|neon-purple\|56,189,248" frontend/src/components/features/MediaDetailModal.jsx
```

Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/features/MediaDetailModal.jsx
git commit -m "style: MediaDetailModal shadows to CP2077 yellow"
```

---

### Task 8: Update AddMediaDialog.jsx and AICmdPalette.jsx

**Files:**
- Modify: `frontend/src/components/features/AddMediaDialog.jsx` (lines ~66)
- Modify: `frontend/src/components/features/AICmdPalette.jsx` (lines ~44, ~83, ~183)

- [ ] **Step 1: Read both files**

Read `AddMediaDialog.jsx` and `AICmdPalette.jsx` to locate exact hardcoded refs.

- [ ] **Step 2: Update AddMediaDialog.jsx**

Replace both `hsl(var(--neon-cyan)/0.4)` and `hsl(var(--neon-cyan)/0.6)` → `hsl(var(--neon-yellow)/0.4)` and `hsl(var(--neon-yellow)/0.6)` in button shadow styles.

- [ ] **Step 3: Update AICmdPalette.jsx**

Replace:
- `hsl(var(--neon-cyan)/0.08)` → `hsl(var(--neon-yellow)/0.08)` (shadow glow)
- `hsl(var(--neon-cyan)/0.2)` → `hsl(var(--neon-yellow)/0.2)` (hover shadow)
- `hsl(var(--neon-cyan)/0.15)` → `hsl(var(--neon-yellow)/0.15)` (hover shadow)

- [ ] **Step 4: Search for remaining old refs in both files**

```bash
grep -n "neon-cyan\|neon-magenta\|neon-purple" frontend/src/components/features/AddMediaDialog.jsx frontend/src/components/features/AICmdPalette.jsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/features/AddMediaDialog.jsx frontend/src/components/features/AICmdPalette.jsx
git commit -m "style: AddMediaDialog + AICmdPalette shadows to CP2077 yellow"
```

---

### Task 9: Update ChatLayout.jsx and KanbanBoard.jsx

**Files:**
- Modify: `frontend/src/components/features/ChatLayout.jsx` (lines ~56)
- Modify: `frontend/src/components/features/KanbanBoard.jsx` (line ~150)

- [ ] **Step 1: Read both files**

Read `ChatLayout.jsx` and `KanbanBoard.jsx` to locate exact refs.

- [ ] **Step 2: Update ChatLayout.jsx**

The `white/[0.04]` and `white/[0.01]` values are neutral white opacity. Check if these should shift to yellow-tinted borders per the spec. If they are generic panel borders, replace:
- `white/[0.04]` → `neon-yellow/[0.04]`
- `white/[0.01]` → leave as-is if it's a background tint (near-invisible, neutral is fine)

Use judgment based on what the element is (read the surrounding JSX).

- [ ] **Step 3: Update KanbanBoard.jsx**

The `var(--color-primary)` reference at line ~150 auto-updates because `--primary` now resolves to yellow. Verify this is correct — it should be a column header glow. No code change needed if it references `--color-primary`.

- [ ] **Step 4: Search for remaining old refs**

```bash
grep -n "neon-cyan\|neon-magenta\|neon-purple" frontend/src/components/features/ChatLayout.jsx frontend/src/components/features/KanbanBoard.jsx
```

Expected: no matches.

- [ ] **Step 5: Commit (if changes were made)**

```bash
git add frontend/src/components/features/ChatLayout.jsx frontend/src/components/features/KanbanBoard.jsx
git commit -m "style: ChatLayout + KanbanBoard borders to CP2077 palette"
```

---

### Task 10: Full Sweep — Find Any Remaining Old Palette References

**Files:**
- All files in `frontend/src/`

- [ ] **Step 1: Search the entire frontend for old color references**

```bash
grep -rn "neon-cyan\|neon-magenta\|neon-purple\|330 85%\|270 80%\|190 95%\|56,189,248\|187.100%" frontend/src/
```

Expected: zero matches. If any are found, update them following the same pattern (cyan→yellow, magenta→yellow, purple→teal).

- [ ] **Step 2: Visual verification in browser**

Open `http://localhost:5173` and check:
1. Page background is pure black
2. Cards/panels are dark grey `#111111` (solid, no blur)
3. Modals are translucent dark with backdrop blur
4. Primary buttons are yellow with black text
5. Links/secondary elements are teal
6. Scrollbar thumb is yellow
7. Ambient orbs are yellow (top-right) and teal (bottom-left)
8. Hover a card — yellow glow appears
9. Hover a glitch-text element — chromatic aberration with yellow/teal/red splitting
10. Delete button is red, hover darkens to dark red

- [ ] **Step 3: Run lint to confirm no breakage**

```bash
cd frontend && npm run lint
```

Expected: no new errors.

- [ ] **Step 4: Run tests**

```bash
cd frontend && npm run test -- --run
```

Expected: all passing (color changes don't affect component logic).

- [ ] **Step 5: Build to verify production bundle**

```bash
cd frontend && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "style: complete CP2077 palette migration — sweep remaining refs"
```
