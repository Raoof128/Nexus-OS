# Design Guidelines

Nexus OS follows a strict **Cyberpunk-First** design language. All new features and UI components must adhere to these principles to maintain the project's premium feel.

## Core Aesthetic

### 1. Color Palette

- **Primary Background**: High-depth darks (e.g., `hsl(240, 10%, 4%)`).
- **Surface Layer**: Semi-transparent glass (`hsl(240, 10%, 7%, 0.7)`) with `backdrop-blur-xl`.
- **Accent - Cyan**: `hsl(180, 100%, 50%)` - Used for primary actions and "active" states.
- **Accent - Magenta**: `hsl(300, 100%, 50%)` - Used for secondary highlights and warnings.
- **Accent - Amber**: `hsl(45, 100%, 50%)` - Used for special categories (e.g., Job Tracking).

### 2. Typography

- **Primary Font**: `Inter` or `Outfit` for high readability.
- **Monospace**: `JetBrains Mono` or `Fira Code` for terminal-style UI elements.
- **Styling**: Use `uppercase` and `letter-spacing: 0.1em` for headers to create a sleek, futuristic look.

### 3. Visual Effects

- **Neon Glow**: Use `box-shadow: 0 0 10px var(--accent-color)` sparingly to avoid visual noise.
- **Scanlines**: A subtle overlay on the desktop background to mimic CRT monitors.
- **Glitch**: Use sparingly for "Loading" states or error transitions.

## Animation Principles

- **Choreography**: Do not animate everything at once. Use staggered delays for list items.
- **Spring Physics**: Prefer "snappy" springs for window opening and "soft" springs for hover transitions.
- **View Transitions**: Always wrap layout changes in `document.startViewTransition` where supported to ensure smooth cross-component morphing.

## Component Checklist

When building a new component, ensure it has:

- [ ] Appropriate `aria-label` for accessibility.
- [ ] `focus-visible` ring that matches the accent color.
- [ ] Responsive behavior (mobile-first).
- [ ] Cyberpunk border or corner detail (e.g., `clip-path` for angled corners).
