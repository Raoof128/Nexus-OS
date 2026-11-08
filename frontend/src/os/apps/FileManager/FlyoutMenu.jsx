import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'

const MENU_WIDTH = 220
const ROW_HEIGHT = 24

// Win7 flyout menu for the Organize button, right-click and long-press. Uses the
// shared .nx-flyout / .nx-menuitem styling and [role=menu] / [role=menuitem] markup.
// Items: { id, label, shortcut?, disabled?, danger?, onSelect } or { separator: true }.
// Radio items add `checked` (boolean) and render as menuitemradio. A { group, items }
// entry is a labelled radio group (role=group) such as "Sort by".
export default function FlyoutMenu({ label, x, y, items, anchorEl, onSelect, onDismiss }) {
  const menuRef = useRef(null)
  const returnFocusRef = useRef(null)

  // restoreFocus is true for Escape: focus returns to whatever opened the menu.
  // Outside clicks and Tab leave focus where the user put it.
  const dismiss = (restoreFocus) => {
    if (restoreFocus) returnFocusRef.current?.focus?.()
    onDismiss()
  }

  // Focus the first enabled item on open; remember where focus was to hand it back.
  useEffect(() => {
    returnFocusRef.current = document.activeElement
    menuRef.current
      ?.querySelector('[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)')
      ?.focus()
  }, [])

  // Clicking outside dismisses the menu. The anchor is ignored so that clicking
  // Organize again toggles it rather than reopening it.
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (menuRef.current?.contains(e.target) || anchorEl?.contains(e.target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [anchorEl, onDismiss])

  const enabledItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll(
        '[role="menuitem"]:not(:disabled),[role="menuitemradio"]:not(:disabled)',
      ) ?? [],
    )

  const handleKeyDown = (e) => {
    const list = enabledItems()
    const index = list.indexOf(document.activeElement)
    switch (e.key) {
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        dismiss(true)
        break
      case 'Tab':
        dismiss(false)
        break
      case 'ArrowDown':
        e.preventDefault()
        list[index < list.length - 1 ? index + 1 : 0]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        list[index > 0 ? index - 1 : list.length - 1]?.focus()
        break
      case 'Home':
        e.preventDefault()
        list[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        list[list.length - 1]?.focus()
        break
      default:
        break
    }
  }

  // Keep the menu on screen: flip it up or left when it would overflow the viewport.
  const rowCount = items.reduce((n, item) => n + (item.group ? item.items.length + 1 : 1), 0)
  const height = rowCount * ROW_HEIGHT + 8
  const left = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(4, Math.min(y, window.innerHeight - height - 8))

  const renderItem = (item) => {
    const radio = item.checked !== undefined
    return (
      <button
        key={item.id}
        type="button"
        role={radio ? 'menuitemradio' : 'menuitem'}
        aria-checked={radio ? item.checked : undefined}
        disabled={item.disabled}
        onClick={() => onSelect(item)}
        className={`nx-menuitem justify-between pointer-coarse:min-h-11 disabled:text-[#8d8d8d] ${
          item.danger ? 'text-destructive' : ''
        }`}
      >
        {radio && (
          <span className="inline-flex w-3 shrink-0 justify-center" aria-hidden="true">
            {item.checked && <Check size={12} />}
          </span>
        )}
        <span className="flex-1">{item.label}</span>
        {item.shortcut && (
          <span className="pl-6 text-[11px] text-muted-foreground">{item.shortcut}</span>
        )}
      </button>
    )
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: 'fixed', left, top, minWidth: MENU_WIDTH, zIndex: 1200 }}
      className="nx-flyout p-[2px]"
    >
      {items.map((item, i) =>
        item.separator ? (
          <div key={`sep-${i}`} role="separator" className="nx-menu-separator" />
        ) : item.group ? (
          <div key={`group-${i}`} role="group" aria-label={item.group}>
            <div
              role="presentation"
              className="px-[10px] pt-[2px] text-[11px] text-muted-foreground"
            >
              {item.group}
            </div>
            {item.items.map((sub) => renderItem(sub))}
          </div>
        ) : (
          renderItem(item)
        ),
      )}
    </div>,
    document.body,
  )
}
