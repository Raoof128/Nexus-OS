// Visual regression for the Windows 7 desktop (TEST-02).
//
//   npm run test:visual                          compare against the baselines
//   npm run test:visual -- --update-snapshots    rewrite the baselines
//
// Baselines: e2e/visual.spec.js-snapshots/, one PNG per screenshot with the
// platform suffix Playwright adds (e.g. desktop-media-vault-visual-linux.png).
// They are platform-specific, and CI does NOT gate on them: font rasterisation
// differs between the CI runner and developer machines (and between Chromium
// builds). Refresh them on the platform you compare on, after an intentional
// UI change, and review every changed PNG before committing.
//
// Determinism: the browser clock is frozen at FIXTURE_NOW (timers keep running,
// so the UI still animates normally); fixtures use the same instant; reduced
// motion, UTC, animations: 'disabled' and caret: 'hide' are set in
// playwright.config.js. Before each capture, fonts and wallpaper images have
// loaded and window geometry has stopped moving. Live System Monitor values
// (CPU, heap, API latency, last check) are masked.
import { devices } from '@playwright/test'
import { test, expect, mockApi, FIXTURE_NOW } from './fixtures.js'

const win = (page, name) => page.getByRole('region', { name, exact: true })

// Desktop Chrome device profile without the browser-type key test.use rejects.
const CHROME = { ...devices['Desktop Chrome'] }
delete CHROME.defaultBrowserType

// The fixture page routes the API to canned data and skips the boot animation.
// Freezing the clock is the only extra setup every test needs.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXTURE_NOW))
})

/** Waits until fonts, wallpaper and images have loaded and nothing moves. */
async function settle(page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await document.fonts.ready
    const urls = new Set()
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage
      for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1])
    }
    await Promise.all(
      [...urls].map(
        (src) =>
          new Promise((resolve) => {
            const img = new Image()
            img.onload = img.onerror = resolve
            img.src = src
          }),
      ),
    )
    await Promise.all(
      [...document.images]
        .filter((img) => !img.complete)
        .map((img) => new Promise((resolve) => (img.onload = img.onerror = resolve))),
    )
  })
  await waitForMotionToStop(page)
}

// Framer Motion animates through JS and Web Animations, which Playwright's
// animations: 'disabled' only partly covers (it fast-forwards CSS animations
// and transitions, not JS-driven ones). Wait until no finite animation is
// running and the shell's boxes and opacities hold still for three reads.
async function waitForMotionToStop(page) {
  let previous = null
  let quietReads = 0
  await expect
    .poll(
      async () => {
        const state = await page.evaluate(() => {
          const running = document.getAnimations().filter((a) => {
            if (a.playState !== 'running' && a.playState !== 'pending') return false
            // Infinite spinners and pulses are frozen by animations: 'disabled'.
            return a.effect?.getComputedTiming().iterations !== Infinity
          }).length
          const boxes = [
            ...document.querySelectorAll(
              '.nx-window, .nx-taskbar, .nx-startmenu, [data-testid="app-launcher"] *, [data-testid="mobile-window"], [role="dialog"], [role="alertdialog"], [role="menu"]',
            ),
          ].map((el) => {
            const r = el.getBoundingClientRect()
            return [r.x, r.y, r.width, r.height, getComputedStyle(el).opacity]
          })
          return JSON.stringify({ running, boxes })
        })
        quietReads = state === previous ? quietReads + 1 : 0
        previous = state
        return quietReads
      },
      { message: 'UI motion did not settle', timeout: 10_000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(3)
}

/**
 * Values System Monitor shows that change between runs or machines: gauges, history
 * graphs, CPU and heap readouts, memory groups, API latency and the last check time.
 */
function liveSystemMonitorValues(page) {
  return [
    page.locator('[role="progressbar"]'),
    page.locator('[role="img"][aria-label*="latest"], [role="img"][aria-label*="no samples"]'),
    page.locator('p.text-\\[22px\\]'),
    page.getByText(/of the JavaScript heap limit/),
    // Status bar: CPU and heap readouts change every sample.
    page.locator('.status-bar-field', { hasText: /CPU|JS heap/ }),
    // Memory groups report this machine's hardware, which differs between machines.
    page.locator('fieldset', { hasText: /Physical memory|Browser memory/ }),
    page
      .locator('div.justify-between', { has: page.getByText('Latency', { exact: true }) })
      .locator('span')
      .last(),
    page
      .locator('div.justify-between', { has: page.getByText('Last check', { exact: true }) })
      .locator('span')
      .last(),
  ]
}

test.describe('logon and desktop', () => {
  test('logon screen', async ({ page }) => {
    await page.unrouteAll()
    await mockApi(page, { authenticated: false })
    await page.goto('/')
    await expect(page.getByLabel(/email/i).first()).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('logon.png')
  })

  test('desktop with Media Vault', async ({ page }) => {
    await page.goto('/')
    await expect(win(page, 'Media Vault')).toBeVisible()
    await expect(page.getByText('The Left Hand of Darkness').first()).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('desktop-media-vault.png')
  })

  test('Start menu open', async ({ page }) => {
    await page.goto('/')
    await expect(win(page, 'Media Vault')).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByTestId('app-launcher')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('start-menu.png')
  })

  test('desktop context menu', async ({ page }) => {
    await page.goto('/')
    await expect(win(page, 'Media Vault')).toBeVisible()
    // Clear of the Media Vault window (spans roughly x 96-1096, y 40-740).
    await page.mouse.click(1300, 600, { button: 'right' })
    await expect(page.getByRole('menu', { name: 'Desktop context menu' })).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('desktop-context-menu.png')
  })

  test('inactive and active window pair', async ({ page }) => {
    // Deep link opens Media Vault first, then Notes on top: Notes is active,
    // Media Vault is the inactive frame behind it.
    await page.goto('/?app=notes')
    const notes = win(page, 'Notes')
    const media = win(page, 'Media Vault')
    await expect(notes).toHaveClass(/active/)
    await expect(media).not.toHaveClass(/active/)
    await settle(page)
    await expect(page).toHaveScreenshot('window-pair-inactive-active.png')
  })

  test('Add media dialog', async ({ page }) => {
    await page.goto('/')
    const media = win(page, 'Media Vault')
    await expect(media).toBeVisible()
    await media.getByRole('button', { name: /Add Book/ }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('add-media-dialog.png')
  })
})

// Each app, maximised, on the 1366x768 desktop. `ready` is text the app shows
// once its canned data has loaded.
const APPS = [
  { id: 'media', title: 'Media Vault', ready: 'The Left Hand of Darkness' },
  { id: 'email', title: 'Email', ready: 'Your reservation is ready' },
  { id: 'chat', title: 'AI Chat' },
  { id: 'terminal', title: 'Terminal' },
  { id: 'files', title: 'File Manager', ready: 'documents' },
  { id: 'settings', title: 'Control Panel' },
  { id: 'sysmon', title: 'System Monitor', ready: 'Performance' },
  { id: 'notes', title: 'Notes' },
  { id: 'tasks', title: 'Tasks', ready: 'Renew passport' },
  { id: 'aion', title: 'Aion' },
]

test.describe('app windows at 1366x768', () => {
  for (const app of APPS) {
    test(`${app.id} window`, async ({ page }) => {
      await page.goto(`/?app=${app.id}`)
      const w = win(page, app.title)
      await expect(w).toBeVisible()
      await w.getByRole('button', { name: 'Maximize window' }).click()
      await expect(w).toHaveClass(/is-maximized/)
      if (app.ready) {
        await expect(page.getByText(app.ready).first()).toBeVisible()
      }
      if (app.id === 'sysmon') {
        // Performance carries the most live values; the masks cover them.
        await page.getByRole('tab', { name: 'Performance' }).click()
      }
      await settle(page)
      await expect(page).toHaveScreenshot(`app-${app.id}.png`, {
        mask: app.id === 'sysmon' ? liveSystemMonitorValues(page) : [],
      })
    })
  }
})

test.describe('phone 390x844', () => {
  test.use({
    ...CHROME,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })

  test('full-screen desktop', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-window')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('mobile-desktop.png')
  })

  test('Start menu on phone', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-window')).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByTestId('app-launcher')).toBeVisible()
    await settle(page)
    await expect(page).toHaveScreenshot('mobile-start-menu.png')
  })
})
