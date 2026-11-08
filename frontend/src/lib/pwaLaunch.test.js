import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { consumeShareTarget, consumeFileHandlers } from './pwaLaunch'
import { INDEX_KEY, PENDING_KEY } from '../os/apps/Notes/noteStore'

function setUrl(search) {
  window.history.replaceState({}, '', search)
}

beforeEach(() => {
  localStorage.clear()
  setUrl('/')
})

afterEach(() => {
  delete window.launchQueue
  vi.restoreAllMocks()
})

// ── consumeShareTarget ────────────────────────────────────────────────────────

describe('consumeShareTarget', () => {
  it('returns null when there is no share-target param', () => {
    setUrl('/?app=notes')
    expect(consumeShareTarget()).toBeNull()
  })

  it('returns "notes" and hands the shared text to the Notes creator', async () => {
    const createNote = vi.fn().mockReturnValue({ id: 'note-1' })
    const onSaved = vi.fn()
    setUrl('/?share-target=1&title=Hello&text=World&url=https://example.com')
    const result = consumeShareTarget({ createNote, onSaved })
    expect(result).toBe('notes')
    expect(createNote).toHaveBeenCalledWith({
      title: 'Hello',
      content: 'World\nhttps://example.com',
    })
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'note-1' }))
    expect(localStorage.getItem('nexus-os:notes')).toBeNull()
  })

  // Desktop calls consumeShareTarget() with no options. The default creator
  // must write the note, or the shared text is dropped.
  it('creates the note by default when no createNote is passed (Desktop path)', async () => {
    const onSaved = vi.fn()
    const onError = vi.fn()
    setUrl('/?share-target=1&title=Hi&text=Hello')

    expect(consumeShareTarget({ onSaved, onError })).toBe('notes')

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onError).not.toHaveBeenCalled()
    const note = onSaved.mock.calls[0][0]
    expect(note).toEqual(expect.objectContaining({ title: 'Hi', content: 'Hi\n\nHello' }))

    const index = JSON.parse(localStorage.getItem(INDEX_KEY))
    expect(index.notes.map((n) => n.id)).toEqual([note.id])
    expect(index.notes[0].title).toBe('Hi')
    expect(JSON.parse(localStorage.getItem(`nexus-os:notes:${note.id}`)).content).toBe(
      'Hi\n\nHello',
    )
    // The Notes window Desktop opens next shows this note.
    expect(localStorage.getItem(PENDING_KEY)).toBe(note.id)
  })

  it('reports to onError when the default creator cannot write (storage full)', () => {
    const onError = vi.fn()
    const quota = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    setUrl('/?share-target=1&text=private')

    expect(consumeShareTarget({ onError })).toBe('notes')
    expect(window.location.search).toBe('')
    expect(onError).toHaveBeenCalledWith(expect.any(DOMException))
    quota.mockRestore()
  })

  it('strips the share params from the URL after consuming', () => {
    setUrl('/?share-target=1&text=hi&app=keep')
    consumeShareTarget({ createNote: vi.fn() })
    const params = new URLSearchParams(window.location.search)
    expect(params.has('share-target')).toBe(false)
    expect(params.has('text')).toBe(false)
    // unrelated params are preserved
    expect(params.get('app')).toBe('keep')
  })

  it('still returns "notes" even when all shared fields are empty', () => {
    setUrl('/?share-target=1')
    const createNote = vi.fn()
    expect(consumeShareTarget({ createNote })).toBe('notes')
    expect(createNote).not.toHaveBeenCalled()
  })

  it('reports an API failure after scrubbing sensitive share parameters', async () => {
    const onError = vi.fn()
    setUrl('/?share-target=1&text=private')

    consumeShareTarget({ createNote: vi.fn().mockRejectedValue(new Error('offline')), onError })

    expect(window.location.search).toBe('')
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)))
    expect(localStorage.getItem('nexus-os:notes')).toBeNull()
  })
})

// ── consumeFileHandlers ───────────────────────────────────────────────────────

describe('consumeFileHandlers', () => {
  it('no-ops when launchQueue is unavailable', () => {
    const openApp = vi.fn()
    const importFile = vi.fn()
    expect(() => consumeFileHandlers({ openApp, importFile })).not.toThrow()
    expect(openApp).not.toHaveBeenCalled()
  })

  it('registers a launchQueue consumer when the API is present', () => {
    const setConsumer = vi.fn()
    window.launchQueue = { setConsumer }
    consumeFileHandlers({ openApp: vi.fn(), importFile: vi.fn() })
    expect(setConsumer).toHaveBeenCalledWith(expect.any(Function))
  })

  it('imports delivered files into /downloads and opens the File Manager', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    const importFile = vi.fn().mockResolvedValue('/downloads/report.txt')

    consumeFileHandlers({ openApp, importFile })

    const fakeFile = { name: 'report.txt' }
    const handle = { getFile: vi.fn().mockResolvedValue(fakeFile) }
    await consumer({ files: [handle] })

    expect(importFile).toHaveBeenCalledWith('/downloads', fakeFile)
    expect(openApp).toHaveBeenCalledWith('files')
  })

  it('does not open the File Manager when no files are delivered', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    consumeFileHandlers({ openApp, importFile: vi.fn() })

    await consumer({ files: [] })
    expect(openApp).not.toHaveBeenCalled()
  })

  it('skips files that fail to read but still processes the rest', async () => {
    let consumer
    window.launchQueue = {
      setConsumer: (fn) => {
        consumer = fn
      },
    }
    const openApp = vi.fn()
    const importFile = vi.fn().mockResolvedValue('/downloads/ok.txt')

    consumeFileHandlers({ openApp, importFile })

    const badHandle = { getFile: vi.fn().mockRejectedValue(new Error('locked')) }
    const goodHandle = { getFile: vi.fn().mockResolvedValue({ name: 'ok.txt' }) }
    await consumer({ files: [badHandle, goodHandle] })

    expect(importFile).toHaveBeenCalledTimes(1)
    expect(openApp).toHaveBeenCalledWith('files')
  })
})
