import { ArrowLeft, ArrowRight, ArrowUp, ChevronRight, Home } from 'lucide-react'
import { APP_TITLE, ROOT_LABEL } from './fileManagerUtils'

// Explorer's top strip: Back, Forward, Up, Home, the address breadcrumb, and a
// search box that filters the current folder.
export default function AddressStrip({
  crumbs,
  folderLabel,
  parentPath,
  canBack,
  canForward,
  onBack,
  onForward,
  onUp,
  onHome,
  onNavigate,
  query,
  onQueryChange,
  isRoot,
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-[#a0afc3] bg-w7-pane px-1.5 py-1">
      <div role="group" aria-label="Navigation" className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onBack}
          disabled={!canBack}
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="Back"
          title="Back (Alt+Left)"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onForward}
          disabled={!canForward}
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="Forward"
          title="Forward (Alt+Right)"
        >
          <ArrowRight size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onUp}
          disabled={parentPath === null}
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="Go up"
          title="Up (Alt+Up)"
        >
          <ArrowUp size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onHome}
          disabled={isRoot}
          className="w7-toolbtn pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          aria-label="Go home"
          title={ROOT_LABEL}
        >
          <Home size={16} aria-hidden="true" />
        </button>
      </div>

      <nav
        aria-label="Current folder"
        className="w7-sunken flex min-h-[24px] min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 py-px pointer-coarse:min-h-11"
      >
        <button
          type="button"
          onClick={() => onNavigate('/')}
          aria-current={isRoot ? 'page' : undefined}
          className="shrink-0 rounded-[2px] px-1 text-foreground hover:bg-w7-hover pointer-coarse:min-h-11"
        >
          {ROOT_LABEL}
        </button>
        {crumbs.map((segment, i) => {
          const path = `/${crumbs.slice(0, i + 1).join('/')}`
          const isLast = i === crumbs.length - 1
          return (
            <span key={path} className="flex shrink-0 items-center gap-0.5">
              <ChevronRight size={12} className="text-muted-foreground" aria-hidden="true" />
              <button
                type="button"
                onClick={() => onNavigate(path)}
                aria-current={isLast ? 'page' : undefined}
                className="rounded-[2px] px-1 text-foreground hover:bg-w7-hover pointer-coarse:min-h-11"
              >
                {segment}
              </button>
            </span>
          )
        })}
      </nav>

      <div className="w-[150px] shrink-0 @md:w-[200px]">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              e.stopPropagation()
              onQueryChange('')
            }
          }}
          placeholder={`Search ${folderLabel || APP_TITLE}`}
          aria-label={`Search ${folderLabel || APP_TITLE}`}
          className="w-full min-w-0 pointer-coarse:h-11"
        />
      </div>
    </div>
  )
}
