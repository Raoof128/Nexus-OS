import { defineConfig, devices } from '@playwright/test'

// E2E + visual checks for the Windows 7 desktop. The backend is never
// contacted: e2e/fixtures.js intercepts every API call with canned data, and
// the Supabase values below are inert placeholders (Realtime simply fails to
// connect).
//
// Suites:
//   npm run test:e2e      functional journeys + privacy + PWA launch (CI gate)
//   npm run test:visual   screenshot regression (e2e/visual.spec.js), opt-in
//   npm run test:parity   7.css parity vs. the live reference (needs network), opt-in
//   npm run test:shots    screenshot capture aid, no assertions, opt-in
//
// The opt-in suites are excluded from a plain `playwright test`. They only
// run when E2E_SUITE names them (the npm scripts set it), so the default run
// never needs network access or a Chromium that matches the visual baselines.
// The visual suite gets its own port so it never reuses (or is reused by) a dev server.
const SUITE = process.env.E2E_SUITE // 'visual' | 'parity' | 'shots' | undefined
const PORT = SUITE === 'visual' ? 4174 : 4173

const OPT_IN_FILES = ['**/visual.spec.js', '**/parity.spec.js', '**/shots.spec.js']
// Outside outputDir (e2e/.results): Playwright empties that directory at the start of every run.
const VISUAL_DIST = './node_modules/.cache/nexus-e2e-visual'

const DESKTOP = { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }

const OPT_IN_PROJECTS = [
  {
    name: 'visual',
    testMatch: /visual\.spec\.js$/,
    use: {
      ...DESKTOP,
      viewport: { width: 1366, height: 768 },
      // Clock in UTC so the taskbar clock text is the same on every machine.
      timezoneId: 'UTC',
      reducedMotion: 'reduce',
      // The production build registers sw.js; keep captures free of caching.
      serviceWorkers: 'block',
    },
  },
  { name: 'parity', testMatch: /parity\.spec\.js$/, use: DESKTOP },
  {
    name: 'shots',
    testMatch: /shots\.spec\.js$/,
    use: DESKTOP,
    grepInvert: /@mobile/,
  },
].filter((project) => project.name === SUITE)

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  // A committed test.only would silently shrink the CI run to one test.
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: {
      // Tolerates sub-pixel font and anti-aliasing noise, nothing more.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: DESKTOP,
      testIgnore: OPT_IN_FILES,
      grepInvert: /@mobile/,
    },
    {
      name: 'mobile',
      // isMobile + hasTouch makes (pointer: coarse) match, so the touch CSS
      // (48px taskbar, 44px tray buttons) is exercised, not just the phone frame.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
      testIgnore: OPT_IN_FILES,
      grep: /@mobile/,
    },
    ...OPT_IN_PROJECTS,
  ],
  webServer: {
    // The visual suite serves a static production build: the dev server's HMR
    // and error overlay can reload or cover the page mid-capture.
    command:
      SUITE === 'visual'
        ? `npx vite build --outDir ${VISUAL_DIST} --emptyOutDir && npx vite preview --outDir ${VISUAL_DIST} --port ${PORT} --strictPort --host 127.0.0.1`
        : `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse a stray server in CI: it could be serving other code.
    reuseExistingServer: !process.env.CI,
    timeout: SUITE === 'visual' ? 240_000 : 60_000,
    env: {
      VITE_API_URL: 'http://127.0.0.1:8799',
      VITE_SUPABASE_URL: 'http://127.0.0.1:8798',
      VITE_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key', // gitleaks:allow (fake e2e placeholder)
      VITE_AION_SUPABASE_URL: 'http://127.0.0.1:8798',
      VITE_AION_SUPABASE_ANON_KEY: 'e2e-placeholder-anon-key', // gitleaks:allow (fake e2e placeholder)
    },
  },
})
