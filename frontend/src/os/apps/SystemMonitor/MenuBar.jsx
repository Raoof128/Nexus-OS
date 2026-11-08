import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

// Menu bar built on 7.css markup: ul[role=menubar] with li[role=menuitem]
// headers and a nested ul[role=menu] that is rendered only while open.
// Keyboard follows the WAI-ARIA menubar pattern.

function wrap(index, length) {
  return ((index % length) + length) % length
}

function enabledItems(menuEl) {
  if (!menuEl) return []
  return Array.from(menuEl.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]')).filter(
    (el) => el.getAttribute('aria-disabled') !== 'true',
  )
}

export default function MenuBar({ menus }) {
  const [openId, setOpenId] = useState(null)
  const [focusIndex, setFocusIndex] = useState(0)
  const barRef = useRef(null)
  const topRefs = useRef({})
  const menuRefs = useRef({})
  const pendingFocus = useRef(null)

  // Close on a pointer press outside the menu bar.
  useEffect(() => {
    if (!openId) return undefined
    const onPointerDown = (event) => {
      if (!barRef.current?.contains(event.target)) setOpenId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [openId])

  // Move focus into a menu once it has rendered.
  useEffect(() => {
    if (!openId || pendingFocus.current == null) return
    const items = enabledItems(menuRefs.current[openId])
    const target = pendingFocus.current === 'last' ? items[items.length - 1] : items[0]
    pendingFocus.current = null
    target?.focus()
  }, [openId])

  const focusItem = (menuId, which) => {
    const items = enabledItems(menuRefs.current[menuId])
    const target = which === 'last' ? items[items.length - 1] : items[0]
    target?.focus()
  }

  const openMenu = (menuId, which = 'first') => {
    if (menuId === openId) {
      focusItem(menuId, which)
      return
    }
    pendingFocus.current = which
    setOpenId(menuId)
  }

  const closeToHeader = (menuId) => {
    topRefs.current[menuId]?.focus()
    setOpenId(null)
  }

  const activate = (menu, item) => {
    if (item.disabled) return
    topRefs.current[menu.id]?.focus()
    setOpenId(null)
    item.onSelect?.()
  }

  const onHeaderKeyDown = (event, index) => {
    // Keys from inside an open menu bubble up here; those are handled by the item.
    if (event.target !== event.currentTarget) return
    const menu = menus[index]
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        event.preventDefault()
        const next = wrap(index + (event.key === 'ArrowRight' ? 1 : -1), menus.length)
        setFocusIndex(next)
        topRefs.current[menus[next].id]?.focus()
        if (openId) openMenu(menus[next].id)
        break
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (openId === menu.id && event.key !== 'ArrowDown') {
          setOpenId(null)
        } else {
          openMenu(menu.id, 'first')
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        openMenu(menu.id, 'last')
        break
      case 'Escape':
        event.preventDefault()
        setOpenId(null)
        break
      default:
        break
    }
  }

  const onItemKeyDown = (event, menu, item) => {
    event.stopPropagation()
    const menuEl = menuRefs.current[menu.id]
    const items = enabledItems(menuEl)
    const current = items.indexOf(event.currentTarget)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        items[(current + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        event.preventDefault()
        items[wrap(current - 1, items.length)]?.focus()
        break
      case 'Home':
        event.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        event.preventDefault()
        items[items.length - 1]?.focus()
        break
      case 'ArrowLeft':
      case 'ArrowRight': {
        event.preventDefault()
        const index = menus.indexOf(menu)
        const next = menus[wrap(index + (event.key === 'ArrowRight' ? 1 : -1), menus.length)]
        setFocusIndex(menus.indexOf(next))
        openMenu(next.id, 'first')
        break
      }
      case 'Escape':
        event.preventDefault()
        closeToHeader(menu.id)
        break
      case 'Tab':
        // Close the menu but leave the default Tab move in place. Focusing the
        // header first stops focus falling to the document body when the menu
        // items unmount.
        closeToHeader(menu.id)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        activate(menu, item)
        break
      default:
        break
    }
  }

  return (
    <ul role="menubar" aria-label="Task Manager menu" ref={barRef} className="shrink-0">
      {menus.map((menu, index) => {
        const isOpen = openId === menu.id
        return (
          <li
            key={menu.id}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            tabIndex={index === focusIndex ? 0 : -1}
            ref={(el) => {
              topRefs.current[menu.id] = el
            }}
            onClick={() => {
              setFocusIndex(index)
              setOpenId((prev) => (prev === menu.id ? null : menu.id))
            }}
            onMouseEnter={() => {
              if (openId && openId !== menu.id) setOpenId(menu.id)
            }}
            onKeyDown={(event) => onHeaderKeyDown(event, index)}
          >
            {menu.label}
            {isOpen && (
              <ul
                role="menu"
                aria-label={menu.label}
                ref={(el) => {
                  menuRefs.current[menu.id] = el
                }}
                // Clicks on separators or padding must not reach the header and toggle the menu.
                onClick={(event) => event.stopPropagation()}
              >
                {menu.items.map((item) => {
                  if (item.separator) {
                    return (
                      <li
                        key={`sep-${item.id ?? menu.items.indexOf(item)}`}
                        role="separator"
                        className="mx-[2px] my-[3px] h-px bg-border"
                      />
                    )
                  }
                  const checkable = Boolean(item.checkable)
                  return (
                    <li
                      key={item.id}
                      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                      aria-checked={checkable ? Boolean(item.checked) : undefined}
                      aria-disabled={item.disabled ? 'true' : undefined}
                      tabIndex={-1}
                      className="relative flex items-center"
                      onClick={(event) => {
                        event.stopPropagation()
                        activate(menu, item)
                      }}
                      onKeyDown={(event) => onItemKeyDown(event, menu, item)}
                    >
                      {checkable && item.checked && (
                        <Check
                          aria-hidden="true"
                          size={12}
                          className="absolute left-1 top-1/2 -translate-y-1/2"
                        />
                      )}
                      {item.label}
                      {item.shortcut && <span className="ml-auto pl-6">{item.shortcut}</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
