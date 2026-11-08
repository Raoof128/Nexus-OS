import { Folder, FolderOpen, HardDrive } from 'lucide-react'
import { ROOT_LABEL, ROOT_PATH, buildEntryPath } from './fileManagerUtils'

function childFolders(files, path) {
  return (files[path]?.children ?? []).filter(
    (name) => files[buildEntryPath(path, name)]?.type === 'folder',
  )
}

function TreeNode({ files, path, name, depth, currentPath, expanded, onToggle, onNavigate }) {
  const folders = childFolders(files, path)
  const hasChildren = folders.length > 0
  const isOpen = hasChildren && expanded.has(path)
  const isCurrent = path === currentPath
  const Icon = path === ROOT_PATH ? HardDrive : isOpen ? FolderOpen : Folder

  return (
    <li
      role="treeitem"
      aria-level={depth}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isCurrent}
    >
      <div className="flex items-center">
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => onToggle(path)}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${name}`}
            className="flex h-6 w-4 shrink-0 items-center justify-center pointer-coarse:h-11 pointer-coarse:w-9"
          >
            <span
              aria-hidden="true"
              className="flex h-[9px] w-[9px] items-center justify-center border border-[#919191] bg-[linear-gradient(180deg,#f2f2f2_45%,#ebebeb)] text-[10px] leading-none font-bold text-[#4b63a7]"
            >
              {isOpen ? '–' : '+'}
            </span>
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="h-6 w-4 shrink-0 pointer-coarse:h-11 pointer-coarse:w-9"
          />
        )}
        <button
          type="button"
          data-tree-path={path}
          tabIndex={isCurrent ? 0 : -1}
          aria-current={isCurrent ? 'page' : undefined}
          onClick={() => onNavigate(path)}
          className="w7-item flex h-6 min-w-0 flex-1 items-center gap-1.5 px-1 text-left pointer-coarse:h-11"
        >
          <Icon
            size={16}
            aria-hidden="true"
            className={path === ROOT_PATH ? 'shrink-0 text-[#3d5a80]' : 'shrink-0 text-[#e0a526]'}
            fill={path === ROOT_PATH ? 'none' : '#ffd96b'}
          />
          <span className="truncate">{name}</span>
        </button>
      </div>
      {isOpen && (
        <ul role="group">
          {folders.map((child) => (
            <TreeNode
              key={child}
              files={files}
              path={buildEntryPath(path, child)}
              name={child}
              depth={depth + 1}
              currentPath={currentPath}
              expanded={expanded}
              onToggle={onToggle}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// Explorer's left navigation pane: a folder tree rooted at Nexus Drive.
// Hidden in narrow windows; the breadcrumb and Up/Home keep navigation available there.
export default function NavPane({ files, currentPath, expanded, onToggle, onNavigate }) {
  const handleKeyDown = (e) => {
    const items = Array.from(e.currentTarget.querySelectorAll('[data-tree-path]'))
    const index = items.indexOf(document.activeElement)
    if (index < 0) return
    const path = items[index].dataset.treePath
    const focusItem = (i) => {
      e.preventDefault()
      items[i]?.focus()
    }
    const hasChildren = childFolders(files, path).length > 0
    switch (e.key) {
      case 'ArrowDown':
        focusItem(Math.min(index + 1, items.length - 1))
        break
      case 'ArrowUp':
        focusItem(Math.max(index - 1, 0))
        break
      case 'Home':
        focusItem(0)
        break
      case 'End':
        focusItem(items.length - 1)
        break
      case 'ArrowRight':
        if (hasChildren && !expanded.has(path)) {
          e.preventDefault()
          onToggle(path)
        } else if (hasChildren) {
          focusItem(index + 1)
        }
        break
      case 'ArrowLeft':
        if (hasChildren && expanded.has(path)) {
          e.preventDefault()
          onToggle(path)
        } else {
          const parentButton = items[index].closest('li')?.parentElement?.closest('li')
          const parentItem = parentButton?.querySelector(':scope > div [data-tree-path]')
          if (parentItem) {
            e.preventDefault()
            parentItem.focus()
          }
        }
        break
      default:
        break
    }
  }

  return (
    <nav
      aria-label="Folders"
      className="w7-navpane hidden w-[190px] shrink-0 overflow-auto py-1 @md:block"
    >
      <ul
        role="tree"
        aria-label="Folders"
        onKeyDown={handleKeyDown}
        className="tree-view m-0 p-1 pl-2 text-[12px]"
      >
        <TreeNode
          files={files}
          path={ROOT_PATH}
          name={ROOT_LABEL}
          depth={1}
          currentPath={currentPath}
          expanded={expanded}
          onToggle={onToggle}
          onNavigate={onNavigate}
        />
      </ul>
    </nav>
  )
}
