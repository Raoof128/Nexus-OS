import { vi } from 'vitest'

// Mock environment variables for tests
vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder-project.supabase.co')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key')
vi.stubEnv('VITE_API_URL', 'https://api.nexus-os.local')
vi.stubEnv('VITE_AION_SUPABASE_URL', 'https://test-aion.supabase.co')
vi.stubEnv('VITE_AION_SUPABASE_ANON_KEY', 'test-aion-anon-key')

// Mock ResizeObserver which is missing in jsdom
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
