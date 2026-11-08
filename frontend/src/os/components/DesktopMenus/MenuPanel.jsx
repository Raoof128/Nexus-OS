import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'

/**
 * Win32-style mnemonic: "&Open" underlines the O and makes it an access key.
 * Labels without "&" have no access key.
 */
function mnemonicOf(label) {
  const i = label.indexOf('&')
  return i >= 0 && i < label.length - 1 ? label[i + 1].toLowerCase() : null
}

function plainLabel(label) {
  return label.replace('&', '')
}

function Label({ text }) {
  const i = text.indexOf('&')
  if (i < 0 || i >= text.length - 1) return text
  return (
    <>
      {text.slice(0, i)}
      <span className="nx-accel">{text[i + 1]}</span>
      {text.slice(i + 2)}
    </>
  )
}

// Items belonging directly to `menu` (not to a nested submenu inside it).
function directItems(menu) {
  return Array.from(menu.querySelectorAll('[data-menu-item]')).filter(
    (el) => el.closest('[role="menu"]') === menu,
  )
}

function enabledItems(menu) {
  return directItems(menu).filter((el) => el.getAttribute('aria-disabled') !== 'true')
}

function indexEntries(items) {
  const byId = new Map()
  for (const entry of items) {
    if (entry.type === 'separator') continue
    byId.set(entry.id, entry)
    for (const sub of entry.items || []) byId.set(sub.id, sub)
  }
  return byId
}

function roleFor(entry) {
  if (entry.radio) return 'menuitemradio'
  if (entry.checked !== undefined) return 'menuitemcheckbox'
  return 'menuitem'
}

/**
 * A Windows 7 style menu (`role="menu"`) with mnemonics, checked and radio
 * items, disabled items (skipped by the keyboard), one level of submenu, and
 * the Win32 keyboard model: arrows, Home/End, letters, Enter/Space, Right/Left
 * for submenus, Escape and Tab to dismiss.
 *
 * `onDismiss(reason)` is called with 'select' after an item runs, or with
 * 'escape' / 'tab' when the user leaves the menu from the keyboard.
 */
export default function MenuPanel({ label, items, onDismiss }) {
  const rootRef = useRef(null)
  const subRef = useRef(null)
  const elements = useRef(new Map())
  const focusSubOnOpen = useRef(false)
  const [subId, setSubId] = useState(null)

  const byId = useMemo(() => indexEntries(items), [items])

  // Focus the first enabled entry on open so the keyboard works immediately.
  useEffect(() => {
    const first = rootRef.current && enabledItems(rootRef.current)[0]
    first?.focus()
  }, [])

  // Open a submenu from the keyboard: move focus into it.
  useEffect(() => {
    if (subId && focusSubOnOpen.current && subRef.current) {
      focusSubOnOpen.current = false
      enabledItems(subRef.current)[0]?.focus()
    }
  }, [subId])

  // Open the submenu to the right, or to the left when it would run off the
  // screen. Set on the element directly so no state change is needed.
  const attachSubmenu = (el) => {
    subRef.current = el
    if (!el) return
    el.style.left = 'calc(100% - 2px)'
    el.style.right = 'auto'
    if (el.getBoundingClientRect().right > window.innerWidth) {
      el.style.left = 'auto'
      el.style.right = 'calc(100% - 2px)'
    }
  }

  const closeSub = () => {
    const parent = subId ? elements.current.get(subId) : null
    setSubId(null)
    parent?.focus()
  }

  const activate = (entry) => {
    if (!entry || entry.disabled) return
    if (entry.items) {
      focusSubOnOpen.current = true
      setSubId(entry.id)
      return
    }
    entry.onSelect?.()
    onDismiss?.('select')
  }

  const hover = (entry) => {
    if (entry.disabled) return
    if (entry.items) {
      setSubId(entry.id)
      return
    }
    setSubId(null)
    elements.current.get(entry.id)?.focus({ preventScroll: true })
  }

  const onKeyDown = (e) => {
    const menu = e.target.closest?.('[role="menu"]')
    if (!menu || !rootRef.current?.contains(menu)) return
    const row = e.target.closest('[data-menu-item]')
    const items2 = enabledItems(menu)
    const index = items2.indexOf(row)
    const entry = row ? byId.get(row.dataset.id) : null
    const isRoot = menu === rootRef.current
    const stop = () => {
      e.preventDefault()
      e.stopPropagation()
    }

    switch (e.key) {
      case 'ArrowDown':
        stop()
        if (items2.length) items2[(index + 1) % items2.length].focus()
        break
      case 'ArrowUp':
        stop()
        if (items2.length) items2[index <= 0 ? items2.length - 1 : index - 1].focus()
        break
      case 'Home':
        stop()
        items2[0]?.focus()
        break
      case 'End':
        stop()
        items2[items2.length - 1]?.focus()
        break
      case 'ArrowRight':
        if (entry?.items && !entry.disabled) {
          stop()
          focusSubOnOpen.current = true
          setSubId(entry.id)
        }
        break
      case 'ArrowLeft':
        if (!isRoot) {
          stop()
          closeSub()
        }
        break
      case 'Escape':
        stop()
        if (!isRoot) closeSub()
        else onDismiss?.('escape')
        break
      case 'Tab':
        // Tab leaves the menu: dismiss rather than letting focus escape it.
        stop()
        onDismiss?.('tab')
        break
      case 'Enter':
      case ' ':
        if (row) {
          stop()
          activate(entry)
        }
        break
      default: {
        if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) break
        const ch = e.key.toLowerCase()
        const matches = items2.filter((el) => el.dataset.accel === ch)
        if (matches.length === 0) break
        stop()
        if (matches.length === 1) {
          activate(byId.get(matches[0].dataset.id))
          break
        }
        const next = matches.find((el) => items2.indexOf(el) > index) ?? matches[0]
        next.focus()
      }
    }
  }

  const renderRow = (entry, { inSub = false } = {}) => {
    const isOpen = !inSub && subId === entry.id
    const checked = entry.checked
    const role = roleFor(entry)
    const accel = mnemonicOf(entry.label)
    return (
      <div
        key={entry.id}
        role={role}
        aria-checked={checked === undefined ? undefined : checked ? 'true' : 'false'}
        aria-disabled={entry.disabled ? 'true' : undefined}
        aria-haspopup={entry.items ? 'menu' : undefined}
        aria-expanded={entry.items ? isOpen : undefined}
        tabIndex={-1}
        data-menu-item
        data-id={entry.id}
        data-accel={accel ?? undefined}
        ref={(el) => {
          if (el) elements.current.set(entry.id, el)
          else elements.current.delete(entry.id)
        }}
        onClick={(e) => {
          e.stopPropagation()
          activate(entry)
        }}
        onPointerEnter={() => hover(entry)}
        className={`nx-menuitem cursor-default select-none ${
          entry.bold ? 'font-bold' : ''
        } aria-[disabled=true]:text-[#6d6d6d] aria-[disabled=true]:hover:border-transparent aria-[disabled=true]:hover:bg-none`}
      >
        <span className="nx-menuitem__icon">
          {checked === true && role === 'menuitemcheckbox' ? (
            <Check size={12} aria-hidden="true" />
          ) : checked === true && role === 'menuitemradio' ? (
            <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-[#3d5a80]" />
          ) : entry.icon ? (
            <entry.icon size={14} aria-hidden="true" />
          ) : null}
        </span>
        <span className="flex-1">
          <Label text={entry.label} />
        </span>
        {entry.hint && <span className="pl-4 text-[#5c5c5c]">{entry.hint}</span>}
        {entry.items && <ChevronRight size={12} aria-hidden="true" className="shrink-0" />}
      </div>
    )
  }

  const renderList = (list, opts) =>
    list.map((entry, i) =>
      entry.type === 'separator' ? (
        <div key={`sep-${i}`} role="separator" className="nx-menu-separator" />
      ) : (
        <div key={entry.id} role="none" className="relative">
          {renderRow(entry, opts)}
          {!opts?.inSub && entry.items && subId === entry.id && !entry.disabled && (
            <div
              ref={attachSubmenu}
              role="menu"
              aria-label={plainLabel(entry.label)}
              className="nx-flyout absolute top-[-3px] z-10 p-[2px]"
              style={{ minWidth: 180 }}
            >
              {renderList(entry.items, { inSub: true })}
            </div>
          )}
        </div>
      ),
    )

  return (
    <div
      ref={rootRef}
      role="menu"
      aria-label={label}
      className="nx-flyout p-[2px]"
      onKeyDown={onKeyDown}
    >
      {renderList(items)}
    </div>
  )
}
