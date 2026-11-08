import { useEffect, useRef } from 'react'

/**
 * Windows 7 window system menu: the title-bar icon menu, opened by a click on
 * the icon or Alt+Space. Uses the 7.css menu markup, `<ul role="menu">` with
 * `<li role="menuitem">` wrapping a `<button>`. Disabled items stay in place
 * (7.css greys them via aria-disabled) and are skipped by the arrow keys.
 *
 * Props:
 *   items      [{ id, label, shortcut?, disabled?, divider? }]; `divider` draws
 *              a separator under the item, as Win7 does above Close.
 *   onSelect   called with the chosen item (the caller closes the menu).
 *   onClose    called with { restoreFocus } on Escape, Tab or an outside click.
 *   anchorRef  the trigger, so a click on it is not treated as outside.
 */
export default function SystemMenu({ items, onSelect, onClose, anchorRef, style }) {
  const menuRef = useRef(null)

  const enabledButtons = () =>
    Array.from(
      menuRef.current?.querySelectorAll(
        'li[role="menuitem"]:not([aria-disabled="true"]) > button:not(:disabled)',
      ) ?? [],
    )

  // Focus the first enabled item on open so the arrow keys work straight away.
  useEffect(() => {
    enabledButtons()[0]?.focus()
    // Runs once, when the menu opens.
  }, [])

  useEffect(() => {
    const handlePointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return
      onClose({ restoreFocus: false })
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [anchorRef, onClose])

  const handleKeyDown = (e) => {
    const buttons = enabledButtons()
    if (buttons.length === 0) return
    const index = buttons.indexOf(document.activeElement)
    let next = null
    switch (e.key) {
      case 'ArrowDown':
        next = buttons[index < 0 || index === buttons.length - 1 ? 0 : index + 1]
        break
      case 'ArrowUp':
        next = buttons[index <= 0 ? buttons.length - 1 : index - 1]
        break
      case 'Home':
        next = buttons[0]
        break
      case 'End':
        next = buttons[buttons.length - 1]
        break
      case 'Escape':
      case 'Tab':
        // Tab closes a transient menu rather than walking focus out of it.
        e.preventDefault()
        e.stopPropagation()
        onClose({ restoreFocus: true })
        return
      default:
        return
    }
    e.preventDefault()
    next.focus()
  }

  return (
    <ul
      ref={menuRef}
      role="menu"
      aria-label="Window menu"
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={style}
      className="w-[190px]"
    >
      {items.map((item) => (
        <li
          key={item.id}
          role="menuitem"
          aria-disabled={item.disabled ? 'true' : undefined}
          className={item.divider ? 'has-divider' : undefined}
        >
          <button type="button" disabled={item.disabled} onClick={() => onSelect(item)}>
            {item.label}
            {item.shortcut && (
              <small className="pl-6 text-[11px] text-muted-foreground">{item.shortcut}</small>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}
