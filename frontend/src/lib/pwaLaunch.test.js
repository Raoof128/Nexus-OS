import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { consumeShareTarget, consumeFileHandlers } from './pwaLaunch'

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

  it('returns "notes" and persists shared text through the authenticated Notes API', async () => {
    const createNote = vi.fn().mockResolvedValue({ id: 'note-1' })
    const onSaved = vi.fn()
    setUrl('/?share-target=1&title=Hello&text=World&url=https://example.com')
    const result = consumeShareTarget({ createNote, onSaved })
    expect(result).toBe('notes')
    expect(createNote).toHaveBeenCalledWith({
      title: 'Hello',
      content: 'World\nhttps://example.com',
      type: 'text',
    })
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'note-1' }))
    expect(localStorage.getItem('nexus-os:notes')).toBeNull()
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
