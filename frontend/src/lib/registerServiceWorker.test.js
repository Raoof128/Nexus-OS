import { describe, it, expect, vi, afterEach } from 'vitest'

// The module has module-level state (deferredPrompt, listeners). Each helper
// resets the registry so tests start with a clean slate.
async function freshModule() {
  vi.resetModules()
  return import('./registerServiceWorker')
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ── onInstallAvailabilityChange ───────────────────────────────────────────────

describe('onInstallAvailabilityChange', () => {
  it('calls the subscriber immediately with the current deferredPrompt (null on fresh module)', async () => {
    const { onInstallAvailabilityChange } = await freshModule()
    const spy = vi.fn()
    onInstallAvailabilityChange(spy)
    expect(spy).toHaveBeenCalledWith(null)
  })

  it('returns an unsubscribe function that prevents future notifications', async () => {
    const { onInstallAvailabilityChange, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const spy = vi.fn()
    const unsub = onInstallAvailabilityChange(spy)
    spy.mockClear()

    unsub()

    // Fire the install prompt event — the unsubscribed spy must NOT be called
    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(fakeEvent)
    expect(spy).not.toHaveBeenCalled()
  })
})

// ── canInstall ───────────────────────────────────────────────────────────────

describe('canInstall', () => {
  it('returns false when no install prompt has fired', async () => {
    const { canInstall } = await freshModule()
    expect(canInstall()).toBe(false)
  })

  it('returns true after a beforeinstallprompt event is captured', async () => {
    const { canInstall, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(fakeEvent)
    expect(canInstall()).toBe(true)
  })

  it('returns false again after the app is installed (appinstalled event)', async () => {
    const { canInstall, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const fakePrompt = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(fakePrompt)
    expect(canInstall()).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))
    expect(canInstall()).toBe(false)
  })
})

// ── promptInstall ─────────────────────────────────────────────────────────────

describe('promptInstall', () => {
  it('returns null immediately when no deferred prompt is available', async () => {
    const { promptInstall } = await freshModule()
    expect(await promptInstall()).toBeNull()
  })

  it("calls event.prompt() and returns the user's outcome", async () => {
    const { promptInstall, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(fakeEvent)

    const outcome = await promptInstall()
    expect(fakeEvent.prompt).toHaveBeenCalled()
    expect(outcome).toBe('accepted')
  })

  it('clears the deferred prompt after use so canInstall returns false', async () => {
    const { promptInstall, canInstall, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(fakeEvent)
    await promptInstall()
    expect(canInstall()).toBe(false)
  })

  it('returns null when userChoice rejects', async () => {
    const { promptInstall, registerServiceWorker } = await freshModule()
    registerServiceWorker()

    const fakeEvent = Object.assign(new Event('beforeinstallprompt'), {
      preventDefault: vi.fn(),
      prompt: vi.fn(),
      userChoice: Promise.reject(new Error('User closed dialog')),
    })
    window.dispatchEvent(fakeEvent)

    expect(await promptInstall()).toBeNull()
  })
})

// ── isStandalone ──────────────────────────────────────────────────────────────
// isStandalone reads only from `window` — no module-level state — so a plain
// import is sufficient and avoids vi.resetModules() complications.

import { isStandalone } from './registerServiceWorker'

// Ensure matchMedia is always present for these tests regardless of prior
// test mutations to the global.
function stubMatchMedia(standaloneMatches = false) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches:
      (standaloneMatches && query === '(display-mode: standalone)') ||
      (standaloneMatches && query === '(display-mode: window-controls-overlay)'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('isStandalone', () => {
  it('returns false when matchMedia reports no standalone display mode', () => {
    stubMatchMedia(false)
    expect(isStandalone()).toBe(false)
  })

  it('returns true when display-mode: standalone matches', () => {
    stubMatchMedia(true)
    expect(isStandalone()).toBe(true)
  })

  it('returns true when navigator.standalone is true (iOS Safari)', () => {
    stubMatchMedia(false)
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    })
    expect(isStandalone()).toBe(true)
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    })
  })
})

// ── registerServiceWorker ─────────────────────────────────────────────────────

describe('registerServiceWorker', () => {
  it('attaches beforeinstallprompt and appinstalled listeners on window', async () => {
    const { registerServiceWorker } = await freshModule()
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    registerServiceWorker()
    const calls = addEventListenerSpy.mock.calls.map(([type]) => type)
    expect(calls).toContain('beforeinstallprompt')
    expect(calls).toContain('appinstalled')
  })

  it('skips service worker registration when not in a secure context', async () => {
    const { registerServiceWorker } = await freshModule()
    // jsdom has navigator.serviceWorker = undefined, so SW registration is skipped
    const spy = vi.spyOn(window, 'addEventListener')
    registerServiceWorker()
    // load listener for SW is never added
    const loadCalls = spy.mock.calls.filter(([type]) => type === 'load')
    expect(loadCalls).toHaveLength(0)
  })
})
