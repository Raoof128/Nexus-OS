import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Command } from 'cmdk'
import { Check, Cpu, Plus, Sparkles, Zap } from 'lucide-react'
import { useSuggest } from '../../../hooks/useSuggest'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'

export default function AICmdPalette({ open, onOpenChange, mediaType = 'book', onAdd }) {
  const [result, setResult] = useState(null)
  const [addedIndices, setAddedIndices] = useState(new Set())
  // Reset prior-suggestion state when the caller switches media type — a 0th
  // book suggestion must not inherit the "Added" flag when the user toggles to
  // movies. Using the render-time reset pattern avoids a setState-in-effect.
  const [lastType, setLastType] = useState(mediaType)
  if (lastType !== mediaType) {
    setLastType(mediaType)
    setAddedIndices(new Set())
    setResult(null)
  }
  const config = MEDIA_CONFIG[mediaType]
  const { suggest, suggestError, suggesting, resetSuggest } = useSuggest(mediaType)

  // Single close path: Escape, the caption close button and the backdrop all
  // reset the prior suggestion state before the parent hears about it.
  const handleOpenChange = (v) => {
    if (!v) {
      setResult(null)
      resetSuggest()
      setAddedIndices(new Set())
    }
    onOpenChange(v)
  }

  const handleAddToArchive = async (suggestion, status, index) => {
    if (!onAdd || addedIndices.has(index)) return
    try {
      await onAdd({
        title: suggestion.title,
        creator: suggestion.creator || '',
        genre: suggestion.genre || null,
        status,
        rating: null,
        takeaway: suggestion.pitch || null,
        sub_info: suggestion.year || null,
      })
      setAddedIndices((prev) => new Set(prev).add(index))
    } catch {
      // mutation error surfaced by useMedia
    }
  }

  const handleSuggest = async () => {
    const response = await suggest()
    if (response) {
      setResult(response)
    }
  }

  return createPortal(
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Ask AI"
      contentClassName="fixed inset-0 z-[1001] flex items-center justify-center p-3 sm:p-4"
      className="window active flex w-full max-w-lg sm:max-w-xl md:max-w-2xl max-h-[85dvh] flex-col overflow-hidden"
      overlayClassName="fixed inset-0 z-[1000] bg-black/20"
    >
      <span className="sr-only" role="heading" aria-level="2">
        AI Command Menu
      </span>
      <p className="sr-only">Search commands or request AI-powered media suggestions.</p>

      <div className="title-bar">
        <div className="title-bar-text">Ask AI</div>
        <div className="title-bar-controls">
          <button
            type="button"
            className="is-close"
            aria-label="Close"
            onClick={() => handleOpenChange(false)}
          />
        </div>
      </div>

      {/* Search row */}
      <div className="flex items-center gap-2 border-b border-border bg-w7-surface p-2">
        <Command.Input
          type="search"
          autoFocus
          placeholder="Type a command or ask for suggestions"
          className="min-w-0 flex-1"
        />
        <kbd className="hidden text-[11px] text-muted-foreground sm:inline">Esc</kbd>
      </div>

      <Command.List className="flex-1 overflow-y-auto bg-background p-2">
        <Command.Empty className="py-10 text-center">
          <Cpu size={24} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
          <p className="text-[12px] text-muted-foreground">No commands match your search.</p>
        </Command.Empty>

        <Command.Group
          heading={<span className="w7-subheading block px-1 pb-1">Actions</span>}
          className="mb-2"
        >
          <Command.Item
            onSelect={handleSuggest}
            className="w7-item my-0.5 flex cursor-pointer items-center gap-3 px-2 py-2"
          >
            <Zap size={16} className="shrink-0 text-[#3d5a80]" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-semibold text-foreground">
                Suggest {config?.singular || 'Media'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Analyze your library and recommend new titles
              </p>
            </div>
          </Command.Item>
        </Command.Group>

        {/* Loading state */}
        {suggesting && (
          <div
            className="my-4 flex flex-col items-center gap-2 py-6"
            role="status"
            aria-label="Loading suggestions"
          >
            <div className="w-48">
              <div role="progressbar" aria-label="Finding suggestions" className="marquee" />
            </div>
            <p className="text-[12px] text-muted-foreground">Finding suggestions…</p>
          </div>
        )}

        {/* Error */}
        {suggestError && (
          <p role="alert" className="w7-error mx-1 text-[12px]">
            {suggestError}
          </p>
        )}

        {/* Results */}
        {result && result.suggestions && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between px-1 py-1">
              <p className="w7-subheading">Suggestions</p>
              <span className="w7-badge">
                {result.source === 'local' ? 'Fallback' : 'Gemini Live'}
              </span>
            </div>

            {result.suggestions.map((s, i) => {
              const added = addedIndices.has(i)
              return (
                <div key={`${s.title}-${i}`} className="w7-card p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Sparkles
                        size={14}
                        className="mt-0.5 shrink-0 text-[#3d5a80]"
                        aria-hidden="true"
                      />
                      <div>
                        <h4 className="text-[13px] font-semibold text-foreground">{s.title}</h4>
                        {(s.creator || s.year) && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {s.creator && (
                              <>
                                {config?.creatorLabel}: {s.creator}
                              </>
                            )}
                            {s.creator && s.year && ' · '}
                            {s.year && s.year}
                          </p>
                        )}
                      </div>
                    </div>
                    {s.genre && <span className="w7-badge shrink-0">{s.genre}</span>}
                  </div>
                  {s.pitch && (
                    <p className="mb-3 ml-6 text-[12px] leading-relaxed text-foreground">
                      {s.pitch}
                    </p>
                  )}

                  {/* Quick-add to archive */}
                  {added ? (
                    <div className="ml-6 flex items-center gap-2 text-success">
                      <Check size={14} aria-hidden="true" />
                      <span className="text-[12px]">Added to archive</span>
                    </div>
                  ) : (
                    onAdd && (
                      <div className="ml-6 flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-[11px] text-muted-foreground">Add as:</span>
                        {config?.statuses.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => handleAddToArchive(s, status, i)}
                            className="w7-btn gap-1 text-[12px]"
                          >
                            <Plus size={10} aria-hidden="true" />
                            {status}
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Command.List>
    </Command.Dialog>,
    document.getElementById('modal-root') || document.body,
  )
}
