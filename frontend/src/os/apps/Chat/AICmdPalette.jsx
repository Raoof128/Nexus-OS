import { useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Check, Cpu, Plus, Sparkles, Zap } from 'lucide-react'
import { useSuggest } from '../../../hooks/useSuggest'
import { MEDIA_CONFIG } from '../../../lib/mediaConfig'

export default function AICmdPalette({
  open,
  onOpenChange,
  onCloseAutoFocus,
  mediaType = 'book',
  onAdd,
}) {
  const [result, setResult] = useState(null)
  const [addedIndices, setAddedIndices] = useState(new Set())
  // The failed quick-add (suggestion index + message), shown under that card.
  const [addError, setAddError] = useState(null)
  // Bumped whenever the suggestion list is replaced or closed, so a quick-add
  // that finishes late cannot mark a card from the previous list.
  const listGenerationRef = useRef(0)
  // Reset prior-suggestion state when the caller switches media type — a 0th
  // book suggestion must not inherit the "Added" flag when the user toggles to
  // movies. Using the render-time reset pattern avoids a setState-in-effect.
  const [lastType, setLastType] = useState(mediaType)
  if (lastType !== mediaType) {
    setLastType(mediaType)
    setAddedIndices(new Set())
    setAddError(null)
    setResult(null)
  }
  const config = MEDIA_CONFIG[mediaType]
  const { suggest, suggestError, suggesting, resetSuggest } = useSuggest(mediaType)

  const clearListState = () => {
    listGenerationRef.current += 1
    setAddedIndices(new Set())
    setAddError(null)
  }

  // Single close path: Escape, the caption close button and the backdrop all
  // reset the prior suggestion state before the parent hears about it.
  const handleOpenChange = (v) => {
    if (!v) {
      setResult(null)
      resetSuggest()
      clearListState()
    }
    onOpenChange(v)
  }

  const handleAddToArchive = async (suggestion, status, index) => {
    if (!onAdd || addedIndices.has(index)) return
    const generation = listGenerationRef.current
    setAddError(null)
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
      if (generation === listGenerationRef.current) {
        setAddedIndices((prev) => new Set(prev).add(index))
      }
    } catch {
      if (generation === listGenerationRef.current) {
        setAddError({
          index,
          message: `“${suggestion.title}” wasn’t added. Check your connection, then try again.`,
        })
      }
    }
  }

  const handleSuggest = async () => {
    let response
    try {
      response = await suggest()
    } catch {
      // The failure is shown from useSuggest's suggestError.
      return
    }
    if (response) {
      // A new list starts with no "Added" marks and no stale add error.
      listGenerationRef.current += 1
      setAddedIndices(new Set())
      setAddError(null)
      setResult(response)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal container={document.getElementById('modal-root') || document.body}>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/20" />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="fixed inset-x-3 top-1/2 z-[1001] mx-auto flex max-h-[85dvh] max-w-xl -translate-y-1/2 flex-col"
        >
          <Command
            label="Ask AI"
            className="window active flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <Dialog.Description className="sr-only">
              Search commands or request AI-powered media suggestions.
            </Dialog.Description>

            <div className="title-bar">
              <Dialog.Title className="title-bar-text">Ask AI</Dialog.Title>
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
                className="min-w-0 flex-1 pointer-coarse:min-h-11"
              />
              <kbd className="hidden text-[11px] text-muted-foreground sm:inline">Esc</kbd>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background p-2">
              <Command.List>
                <Command.Empty className="py-10 text-center">
                  <Cpu
                    size={24}
                    className="mx-auto mb-3 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    No commands match your search.
                  </p>
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
              </Command.List>

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
                <p role="alert" className="w7-error mx-1 wrap-anywhere text-[12px]">
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
                        <div className="mb-2 flex min-w-0 items-start gap-2.5">
                          <Sparkles
                            size={14}
                            className="mt-0.5 shrink-0 text-[#3d5a80]"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <h4 className="wrap-anywhere text-[13px] font-semibold text-foreground">
                              {s.title}
                            </h4>
                            {(s.creator || s.year) && (
                              <p className="mt-0.5 wrap-anywhere text-[11px] text-muted-foreground">
                                {s.creator && (
                                  <>
                                    {config?.creatorLabel}: {s.creator}
                                  </>
                                )}
                                {s.creator && s.year && ' · '}
                                {s.year && s.year}
                              </p>
                            )}
                            {s.genre && (
                              <span className="w7-badge mt-1 max-w-full wrap-anywhere whitespace-normal">
                                {s.genre}
                              </span>
                            )}
                          </div>
                        </div>
                        {s.pitch && (
                          <p className="mb-3 ml-6 wrap-anywhere text-[12px] leading-relaxed text-foreground">
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
                              <span className="mr-1 text-[11px] text-muted-foreground">
                                Add as:
                              </span>
                              {config?.statuses.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => handleAddToArchive(s, status, i)}
                                  className="w7-btn gap-1 text-[12px] pointer-coarse:min-h-11"
                                >
                                  <Plus size={10} aria-hidden="true" />
                                  {status}
                                </button>
                              ))}
                            </div>
                          )
                        )}
                        {addError?.index === i && (
                          <p role="alert" className="ml-6 mt-2 w7-error wrap-anywhere text-[12px]">
                            {addError.message}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
