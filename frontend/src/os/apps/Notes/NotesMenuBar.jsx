import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'

const ENABLED_ITEM_SELECTOR =
  'li[role="menuitem"]:not([aria-disabled="true"]) > button:not(:disabled)'

/**
 * The Notepad-style menu bar. Uses the 7.css menu markup: `<ul role="menubar">`
 * with `<li role="menuitem">` top-level entries, each holding a `<ul role="menu">`
 * while it is open. Clicking or pressing Enter/Down opens a menu; ←/→ move
 * between menus; ↑/↓ move between items; Esc and Tab close the menu.
 *
 * Props:
 *   menus      [{ id, label, items: [{ id, label, shortcut?, disabled?, divider?,
 *                checked?, onSelect }] }]. `checked` (true/false) makes the item
 *              a toggle, drawn with a tick and exposed through aria-pressed.
 */
export default function NotesMenuBar({ menus }) {
  const [openId, setOpenId] = useState(null)
  const barRef = useRef(null)
  const menuRef = useRef(null)
  const titleRefs = useRef({})

  // Put focus on the first enabled item as soon as a menu opens.
  useEffect(() => {
    if (!openId) return
    menuRef.current?.querySelector(ENABLED_ITEM_SELECTOR)?.focus()
  }, [openId])

  // Click anywhere outside the bar closes the open menu.
  useEffect(() => {
    if (!openId) return
    const handlePointerDown = (e) => {
      if (barRef.current?.contains(e.target)) return
      setOpenId(null)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [openId])

  const focusTop = useCallback((id) => {
    titleRefs.current[id]?.focus()
  }, [])

  const closeMenu = useCallback(
    (restoreFocus) => {
      const id = openId
      setOpenId(null)
      if (restoreFocus && id) focusTop(id)
    },
    [openId, focusTop],
  )

  const shiftMenu = (step) => {
    const index = menus.findIndex((m) => m.id === openId)
    const next = menus[(index + step + menus.length) % menus.length]
    setOpenId(next.id)
    focusTop(next.id)
  }

  // Keys on a menu title. Keys pressed on an open menu's items bubble up to the
  // title too; they must be ignored here, or Enter and Space never reach the
  // item's button (preventDefault would stop its click).
  const handleTitleKey = (e) => {
    if (e.target !== e.currentTarget) return
    const id = e.currentTarget.dataset.menuId
    const index = menus.findIndex((m) => m.id === id)
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        e.preventDefault()
        const step = e.key === 'ArrowRight' ? 1 : -1
        const next = menus[(index + step + menus.length) % menus.length]
        if (openId) setOpenId(next.id)
        focusTop(next.id)
        return
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        e.preventDefault()
        setOpenId(id)
        return
      case 'Escape':
        setOpenId(null)
        return
      default:
    }
  }

  const handleTitleClick = (e, id) => {
    // Clicks inside the open menu are item clicks, not title clicks.
    if (menuRef.current?.contains(e.target)) return
    setOpenId(openId === id ? null : id)
  }

  const handleMenuKey = (e) => {
    const items = Array.from(menuRef.current?.querySelectorAll(ENABLED_ITEM_SELECTOR) ?? [])
    const index = items.indexOf(document.activeElement)
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        items[index < 0 || index === items.length - 1 ? 0 : index + 1]?.focus()
        return
      case 'ArrowUp':
        e.preventDefault()
        items[index <= 0 ? items.length - 1 : index - 1]?.focus()
        return
      case 'Home':
        e.preventDefault()
        items[0]?.focus()
        return
      case 'End':
        e.preventDefault()
        items[items.length - 1]?.focus()
        return
      case 'ArrowRight':
        e.preventDefault()
        shiftMenu(1)
        return
      case 'ArrowLeft':
        e.preventDefault()
        shiftMenu(-1)
        return
      case 'Escape':
      case 'Tab':
        // Tab closes the menu rather than walking focus out of the bar.
        e.preventDefault()
        closeMenu(true)
        return
      default:
    }
  }

  const choose = (item) => {
    // Return focus to the menu title first, so an action that moves focus
    // (back to the note, into a dialog) has the last word.
    closeMenu(true)
    item.onSelect?.()
  }

  return (
    <ul ref={barRef} role="menubar" aria-label="Menu bar" className="shrink-0">
      {menus.map((menu) => {
        const isOpen = openId === menu.id
        return (
          // The title is the menu item itself, as 7.css's menubar expects. A
          // button here would be drawn as a Win7 push button.
          <li
            key={menu.id}
            ref={(el) => {
              titleRefs.current[menu.id] = el
            }}
            role="menuitem"
            tabIndex={0}
            data-menu-id={menu.id}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={(e) => handleTitleClick(e, menu.id)}
            onKeyDown={handleTitleKey}
            onMouseEnter={() => {
              if (openId && openId !== menu.id) setOpenId(menu.id)
            }}
            className="focus-visible:-outline-offset-2 focus-visible:outline-1 focus-visible:outline-dotted focus-visible:outline-black"
          >
            {menu.label}
            {isOpen && (
              <ul
                ref={menuRef}
                role="menu"
                aria-label={menu.label}
                onKeyDown={handleMenuKey}
                className="w-max min-w-[200px]"
              >
                {menu.items.map((item) => (
                  <li
                    key={item.id}
                    role="menuitem"
                    aria-disabled={item.disabled ? 'true' : undefined}
                    className={item.divider ? 'has-divider' : undefined}
                  >
                    <button
                      type="button"
                      disabled={item.disabled}
                      aria-pressed={item.checked === undefined ? undefined : item.checked}
                      onClick={() => choose(item)}
                    >
                      {item.checked !== undefined && (
                        <Check
                          size={12}
                          aria-hidden="true"
                          className={`absolute top-1/2 left-2 -translate-y-1/2 ${
                            item.checked ? 'text-[#0c12a1]' : 'invisible'
                          }`}
                        />
                      )}
                      {item.label}
                      {item.shortcut && (
                        <small className="pl-6 text-[11px] text-[#5c5c5c]">{item.shortcut}</small>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
