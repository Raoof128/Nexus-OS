/**
 * Global z-index scale for the Nexus OS.
 *
 * The previous layout mixed windows (z:100–199) with in-app modals (z:80–110),
 * so a modal opened in a non-top window could render *below* another window.
 * The ladder below is deliberately gapped so future layers can slot in.
 *
 * Windows are assigned `BASE_WINDOW + zStack.indexOf(id)` in Desktop.jsx.
 * Keep that range below SNAP_PREVIEW's upper bound to avoid overlap.
 *
 * Consumers may use either the numeric values directly (inline style) or the
 * Tailwind class strings (`CLASS`) where the scale fits an existing utility.
 */

export const Z = {
  DESKTOP_GRID: -1,
  DESKTOP_ICONS: 2,
  SNAP_PREVIEW: 90,
  WINDOW_BASE: 100, // + zStack.indexOf → 100..~250 in practice
  TASKBAR: 500,
  APP_LAUNCHER_BACKDROP: 599,
  APP_LAUNCHER: 600,
  MODAL_BACKDROP: 1000,
  MODAL: 1001,
  MODAL_NESTED_BACKDROP: 1050,
  MODAL_NESTED: 1051, // confirm dialogs stacked over a content modal
  NOTIFICATION: 1500,
  LOCK_SCREEN: 2000,
  BOOT_SEQUENCE: 9999,
}

// Pre-built Tailwind class fragments so components can drop the right z-*
// utility without recomputing the arbitrary-value string every render.
export const ZC = {
  SNAP_PREVIEW: 'z-[90]',
  TASKBAR: 'z-[500]',
  APP_LAUNCHER_BACKDROP: 'z-[599]',
  APP_LAUNCHER: 'z-[600]',
  MODAL_BACKDROP: 'z-[1000]',
  MODAL: 'z-[1001]',
  MODAL_NESTED_BACKDROP: 'z-[1050]',
  MODAL_NESTED: 'z-[1051]',
  NOTIFICATION: 'z-[1500]',
  LOCK_SCREEN: 'z-[2000]',
  BOOT_SEQUENCE: 'z-[9999]',
}
