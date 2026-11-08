// Critical user journeys on the Windows 7 desktop, against mocked API
// fixtures (e2e/fixtures.js) — no backend, no real accounts.
import { test, expect, mockApi } from './fixtures.js'

const win = (page, name) => page.getByRole('region', { name, exact: true })

async function openDesktop(page) {
  await page.goto('/')
  await expect(win(page, 'Media Vault')).toBeVisible()
}

async function launchFromStart(page, query, appName) {
  await page.getByRole('button', { name: 'Start' }).click()
  const search = page.getByRole('searchbox', { name: 'Search programs' })
  await expect(search).toBeFocused()
  await search.fill(query)
  await expect(page.getByRole('option', { name: new RegExp(appName) })).toBeVisible()
  await search.press('Enter')
  await expect(page.getByTestId('app-launcher')).toBeHidden()
  await expect(win(page, appName)).toBeVisible()
}

test.describe('desktop shell', () => {
  test('first boot opens Media Vault inside Win7 chrome', async ({ page }) => {
    await openDesktop(page)
    const w = win(page, 'Media Vault')
    await expect(w).toHaveClass(/window/)
    await expect(w).toHaveClass(/active/)
    await expect(w.getByRole('button', { name: 'Minimize window' })).toBeVisible()
    await expect(w.getByRole('button', { name: 'Maximize window' })).toBeVisible()
    await expect(w.getByRole('button', { name: 'Close window' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Taskbar' })).toBeVisible()
  })

  test('Start menu: search, launch, Escape and focus', async ({ page }) => {
    await openDesktop(page)
    await launchFromStart(page, 'task', 'Tasks')
    // Escape closes without launching
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByTestId('app-launcher')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('app-launcher')).toBeHidden()
    // No-match message
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('searchbox', { name: 'Search programs' }).fill('zzzz')
    await expect(page.getByText('No items match your search.')).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('drag, resize, maximise, restore and minimise a window', async ({ page }) => {
    await openDesktop(page)
    const w = win(page, 'Media Vault')
    const before = await w.boundingBox()

    // Drag by the title bar
    const bar = w.getByTestId('titlebar')
    const bb = await bar.boundingBox()
    await page.mouse.move(bb.x + 200, bb.y + 12)
    await page.mouse.down()
    await page.mouse.move(bb.x + 280, bb.y + 72, { steps: 8 })
    await page.mouse.up()
    await expect
      .poll(async () => Math.round((await w.boundingBox()).x - before.x))
      .toBeGreaterThan(60)

    // Resize from the bottom-right corner
    const moved = await w.boundingBox()
    await page.mouse.move(moved.x + moved.width - 3, moved.y + moved.height - 3)
    await page.mouse.down()
    await page.mouse.move(moved.x + moved.width - 103, moved.y + moved.height - 83, {
      steps: 6,
    })
    await page.mouse.up()
    await expect
      .poll(async () => Math.round(moved.width - (await w.boundingBox()).width))
      .toBeGreaterThan(80)

    // Maximise → restore
    await w.getByRole('button', { name: 'Maximize window' }).click()
    await expect(w).toHaveClass(/is-maximized/)
    await w.getByRole('button', { name: 'Restore window' }).click()
    await expect(w).not.toHaveClass(/is-maximized/)

    // Minimise → taskbar button restores it
    await w.getByRole('button', { name: 'Minimize window' }).click()
    await expect(w).toBeHidden()
    await page
      .getByRole('navigation', { name: 'Taskbar' })
      .getByRole('button', { name: 'Media Vault' })
      .click()
    await expect(win(page, 'Media Vault')).toBeVisible()
  })

  test('taskbar switches between windows; clicking the active one minimises it', async ({
    page,
  }) => {
    await openDesktop(page)
    await launchFromStart(page, 'notes', 'Notes')
    const taskbar = page.getByRole('navigation', { name: 'Taskbar' })
    await expect(win(page, 'Notes')).toHaveClass(/active/)
    await taskbar.getByRole('button', { name: 'Media Vault' }).click()
    await expect(win(page, 'Media Vault')).toHaveClass(/active/)
    await expect(win(page, 'Notes')).not.toHaveClass(/active/)
    // Win7: clicking the active window's button minimises it
    await taskbar.getByRole('button', { name: 'Media Vault' }).click()
    await expect(win(page, 'Media Vault')).toBeHidden()
  })

  test('snap with keyboard and Aero Snap drag to the left edge', async ({ page }) => {
    await openDesktop(page)
    const w = win(page, 'Media Vault')
    await w.getByTestId('titlebar').click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('Alt+ArrowRight')
    await expect
      .poll(async () => {
        const b = await w.boundingBox()
        const vw = page.viewportSize().width
        return Math.abs(b.x - vw / 2) < 4 && Math.abs(b.width - vw / 2) < 4
      })
      .toBe(true)
    // Dragging a snapped window restores it; then drag to the left edge snaps.
    const bar = w.getByTestId('titlebar')
    let bb = await bar.boundingBox()
    await page.mouse.move(bb.x + 100, bb.y + 10)
    await page.mouse.down()
    await page.mouse.up()
    // Un-snapping animates back to the restored rect (240ms); wait for it.
    await expect(w).not.toHaveClass(/is-maximized/)
    await expect
      .poll(async () => Math.round(Math.abs((await w.boundingBox()).width - 1000)))
      .toBeLessThan(2)
    await page.waitForTimeout(300)
    bb = await bar.boundingBox()
    await page.mouse.move(bb.x + 100, bb.y + 10)
    await page.mouse.down()
    await page.mouse.move(2, 300, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => Math.round((await w.boundingBox()).x)).toBeLessThan(2)
  })

  test('Show desktop toggles every window away and back', async ({ page }) => {
    await openDesktop(page)
    await launchFromStart(page, 'notes', 'Notes')
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Notes')).toBeHidden()
    await expect(win(page, 'Media Vault')).toBeHidden()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Notes')).toBeVisible()
    await expect(win(page, 'Media Vault')).toBeVisible()
  })

  test('desktop icons open apps; context menu works with the keyboard', async ({ page }) => {
    await openDesktop(page)
    await page.getByRole('button', { name: 'Open Tasks' }).dblclick()
    await expect(win(page, 'Tasks')).toBeVisible()
    await page.mouse.click(1200, 700, { button: 'right' })
    const menu = page.getByRole('menu', { name: 'Desktop context menu' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('layout persists across reload', async ({ page }) => {
    await openDesktop(page)
    await launchFromStart(page, 'notes', 'Notes')
    await win(page, 'Notes').getByRole('button', { name: 'Maximize window' }).click()
    await page.waitForTimeout(800) // persistence is debounced
    await page.reload()
    await expect(win(page, 'Notes')).toBeVisible()
    await expect(win(page, 'Notes')).toHaveClass(/is-maximized/)
    await expect(win(page, 'Media Vault')).toBeVisible()
  })

  test('keyboard shortcuts: Alt+L Start menu, Alt+W close', async ({ page }) => {
    await openDesktop(page)
    await win(page, 'Media Vault')
      .getByTestId('titlebar')
      .click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('Alt+l')
    await expect(page.getByTestId('app-launcher')).toBeVisible()
    await page.keyboard.press('Escape')
    await win(page, 'Media Vault')
      .getByTestId('titlebar')
      .click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('Alt+w')
    await expect(win(page, 'Media Vault')).toBeHidden()
  })

  test('Lock from the Start menu shows the lock screen', async ({ page }) => {
    await openDesktop(page)
    await page.getByRole('button', { name: 'Start' }).click()
    await page.getByRole('button', { name: 'Lock' }).click()
    await expect(page.getByTestId('app-launcher')).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Taskbar' })).toBeVisible()
    const lock = page.getByRole('dialog', { name: /Lock screen/ })
    await expect(lock).toBeVisible()
    await page.waitForTimeout(400)
    await expect(lock).toBeVisible() // stays locked after the triggering click
    await page.keyboard.press('Enter')
    await expect(lock).toBeHidden()
  })
})

test.describe('signed out', () => {
  test('shows the Win7 logon screen with a working sign-in form', async ({ page }) => {
    await page.unrouteAll()
    await mockApi(page, { authenticated: false })
    await page.goto('/')
    const email = page.getByLabel(/email/i).first()
    await expect(email).toBeVisible()
    await expect(page.getByLabel(/password/i).first()).toBeVisible()
  })
})

test.describe('mobile @mobile', () => {
  test('full-screen window with reachable close button and Start menu', async ({ page }) => {
    await page.goto('/')
    const w = page.getByTestId('mobile-window')
    await expect(w).toBeVisible()
    const box = await w.boundingBox()
    const vw = page.viewportSize().width
    expect(Math.round(box.width)).toBeLessThanOrEqual(vw)
    await expect(w.getByRole('button', { name: 'Close window' })).toBeVisible()
    // No horizontal page overflow
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByTestId('app-launcher')).toBeVisible()
    await page.getByRole('option', { name: /Notes/ }).click()
    // Newest window stacks on top of the full-screen Media Vault.
    await expect(page.getByRole('region', { name: 'Notes', exact: true })).toBeVisible()
  })
})

const VIEWPORTS = [
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
]

test.describe('responsive', () => {
  for (const [width, height] of VIEWPORTS) {
    test(`no horizontal overflow and reachable shell at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/')
      const media = page.getByRole('region', { name: 'Media Vault', exact: true })
      await expect(media).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      // Window chrome stays inside the viewport so its close button is reachable.
      const close = media.getByRole('button', { name: 'Close window' })
      const cb = await close.boundingBox()
      expect(cb.x + cb.width).toBeLessThanOrEqual(width)
      expect(cb.y).toBeGreaterThanOrEqual(0)
      // Taskbar and Start menu fit.
      await page.getByRole('button', { name: 'Start' }).click()
      const menu = page.getByTestId('app-launcher')
      await expect(menu).toBeVisible()
      const mb = await menu.boundingBox()
      expect(mb.x).toBeGreaterThanOrEqual(0)
      expect(mb.x + mb.width).toBeLessThanOrEqual(width + 1)
      expect(mb.y).toBeGreaterThanOrEqual(0)
    })
  }
})
