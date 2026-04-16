/**
 * Motion tokens — the canonical durations, easings, and spring configs used
 * across the OS.
 *
 * Before this file landed, durations ranged over 11 distinct values
 * (0.1, 0.15, 0.2, 0.25, 0.3, …) and three near-identical spring configs
 * were reinvented per component. Consolidating here keeps the motion
 * language coherent: the same transition feels the same everywhere.
 *
 * `MotionConfig reducedMotion="user"` at the app root disables these
 * transitions automatically for users with `prefers-reduced-motion: reduce`
 * — consumers don't need to branch per call.
 *
 * Choreographed animations (BootSequence, LockScreen ambient loops) keep
 * their own bespoke timings — they're not UI chrome and their motion *is*
 * the content.
 */

export const DURATION = {
  fast: 0.15,
  base: 0.2,
  slow: 0.3,
}

export const EASE = {
  // Standard UI easing — most fades, slides, and scales.
  standard: 'easeOut',
  // Paired in/out when animating between two states symmetrically.
  inOut: 'easeInOut',
  // Emphasized — used for panel slides (auth panel) to feel more deliberate.
  emphasized: [0.16, 1, 0.3, 1],
}

export const SPRING = {
  // Gentle bounce for large morphs — modals, `layoutId` card→detail transforms.
  soft: { type: 'spring', damping: 28, stiffness: 280 },
  // Tighter pop for small surfaces — launcher, notification toasts, confirm dialogs.
  snappy: { type: 'spring', damping: 25, stiffness: 320 },
}

// Pre-composed transitions for the two most common patterns so consumers
// can drop them in without rebuilding the object literal per call.
export const TRANSITION_FADE = { duration: DURATION.base, ease: EASE.standard }
export const TRANSITION_FAST = { duration: DURATION.fast, ease: EASE.standard }
