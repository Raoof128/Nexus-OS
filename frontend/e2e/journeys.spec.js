// Critical user journeys on the Windows 7 desktop, against mocked API
// fixtures (e2e/fixtures.js) — no backend, no real accounts.
import { test, expect, mockApi } from './fixtures.js'

const win = (page, name) => page.getByRole('region', { name, exact: true })

async function openDesktop(page) {
  await page.goto('/')
  await expect(win(page, 'Media Vault')).toBeVisible()
}

const LONG_MOVIE_TITLE = 'An uninterrupted long title: ' + 'Extraordinary'.repeat(10)

async function openLongMovieCollection(page) {
  await page.route('http://127.0.0.1:8799/media?type=movie', (route) =>
    route.fulfill({
      json: Array.from({ length: 8 }, (_, index) => ({
        id: `long-movie-${index}`,
        type: 'movie',
        status: 'Finished',
        title: index === 0 ? LONG_MOVIE_TITLE : `Film ${index + 1}`,
        creator: 'ProductionCompany'.repeat(6),
        genre: 'Folk Horror / Supernatural Thriller / ' + 'LongGenre'.repeat(7),
        rating: 5,
        takeaway: `https://example.test/${'long-note'.repeat(35)}`,
      })),
    }),
  )
  await page.goto('/?type=movie')
  const panel = win(page, 'Media Vault').getByRole('tabpanel')
  await expect(panel.getByRole('heading', { name: LONG_MOVIE_TITLE })).toBeVisible()
  return panel
}

async function expectNoHorizontalScroll(locator) {
  await expect
    .poll(() =>
      locator.evaluate((node) =>
        [node, ...node.querySelectorAll('*')].every(
          (element) =>
            !/auto|scroll/.test(getComputedStyle(element).overflowX) ||
            element.scrollWidth <= element.clientWidth + 1,
        ),
      ),
    )
    .toBe(true)
}

test('long Media Vault cards keep list actions in view after a window resize', async ({ page }) => {
  const panel = await openLongMovieCollection(page)
  const media = win(page, 'Media Vault')
  const w = await media.boundingBox()
  await page.mouse.move(w.x + w.width - 3, w.y + w.height - 3)
  await page.mouse.down()
  await page.mouse.move(w.x + 743, w.y + 407, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await media.boundingBox()).width).toBeLessThan(800)
  await waitForStillBox(media)

  await expectNoHorizontalScroll(panel)
  const showMore = panel.getByRole('button', { name: 'Show 3 more' })
  await expect(showMore).toBeInViewport({ ratio: 1 })
  await showMore.click()
  await expect(panel.getByRole('heading', { name: 'Finished — Movies' })).toBeVisible()
  await expectNoHorizontalScroll(panel.getByRole('table').locator('..'))
  const search = panel.getByRole('searchbox', { name: 'Search vault' })
  await search.fill('  Film 8  ')
  await expect(panel.locator('[data-vault-row]')).toHaveCount(1)
  await expect(panel.getByRole('button', { name: 'Film 8' })).toBeVisible()
})

test('long Media Vault entries fit the touch board and details @mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 })
  const panel = await openLongMovieCollection(page)
  await expectNoHorizontalScroll(panel)

  const title = panel.getByRole('button', { name: LONG_MOVIE_TITLE })
  await title.focus()
  await title.press('Enter')
  const details = page.getByRole('dialog', { name: LONG_MOVIE_TITLE })
  await expect(details).toBeVisible()
  await expectNoHorizontalScroll(details)
  await details.getByRole('button', { name: 'Close', exact: true }).last().click()
  await expect(details).toBeHidden()
  await expect(title).toBeFocused()
})

/** Resolves once the box has the same geometry on two reads 100ms apart (animation finished). */
async function waitForStillBox(locator) {
  let previous = null
  await expect
    .poll(
      async () => {
        const box = JSON.stringify(await locator.boundingBox())
        const still = box === previous
        previous = box
        return still
      },
      { intervals: [100] },
    )
    .toBe(true)
}

async function lockFromStart(page) {
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Shut down options' }).click()
  await page.getByRole('menuitem', { name: 'Lock' }).click()
  await expect(page.getByRole('dialog', { name: /Lock screen/ })).toBeVisible()
}

/** Snapped-right geometry: the right half of the viewport. */
async function onRightHalf(locator, page) {
  const b = await locator.boundingBox()
  const vw = page.viewportSize().width
  return Math.abs(b.x - vw / 2) < 4 && Math.abs(b.width - vw / 2) < 4
}

async function launchFromStart(page, query, appName) {
  await page.getByRole('button', { name: 'Start' }).click()
  const search = page.getByRole('searchbox', { name: 'Search programs' })
  await expect(search).toBeFocused()
  await search.fill(query)
  await expect(
    page.getByTestId('app-launcher').getByRole('option', { name: new RegExp(appName) }),
  ).toBeVisible()
  await search.press('Enter')
  await expect(page.getByTestId('app-launcher')).toBeHidden()
  await expect(win(page, appName)).toBeVisible()
}

test.describe('desktop personalization', () => {
  test('changes the desktop tint and previews, cancels and saves wallpapers', async ({ page }) => {
    await page.goto('/?app=settings')
    const settings = win(page, 'Control Panel')
    const frame = settings.locator('.title-bar')
    const taskbar = page.getByRole('navigation', { name: 'Taskbar' })
    const wallpaper = page.locator('.nx-wallpaper-aero')
    const initialTaskbar = await taskbar.evaluate((el) => getComputedStyle(el).backgroundColor)

    await settings.getByRole('button', { name: 'Leaf', exact: true }).click()
    await expect
      .poll(() =>
        frame.evaluate((el) => getComputedStyle(el.parentElement, '::before').backgroundColor),
      )
      .toBe('rgb(76, 143, 58)')
    await expect(taskbar).not.toHaveCSS('background-color', initialTaskbar)
    await settings.getByLabel('Custom color').fill('#9452a3')
    await expect
      .poll(() =>
        frame.evaluate((el) => getComputedStyle(el.parentElement, '::before').backgroundColor),
      )
      .toBe('rgb(148, 82, 163)')

    await settings.getByRole('button', { name: 'Wallpaper 3', exact: true }).click()
    await expect(wallpaper).toHaveCSS('background-image', /W3\.jpg/)
    await settings.getByRole('combobox', { name: 'Picture position' }).selectOption('fit')
    await expect(wallpaper).toHaveCSS('background-size', 'contain')
    await settings.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(wallpaper).toHaveCSS('background-image', /aero\.svg/)

    await settings.getByRole('button', { name: 'Wallpaper 3', exact: true }).click()
    await settings.getByRole('combobox', { name: 'Picture position' }).selectOption('fit')
    await settings.getByRole('button', { name: 'Save changes', exact: true }).click()
    await page.reload()
    await expect(wallpaper).toHaveCSS('background-image', /W3\.jpg/)
    await expect(wallpaper).toHaveCSS('background-size', 'contain')
    await expect(settings.getByLabel('Custom color')).toHaveValue('#9452a3')
  })
})

test.describe('scheduled tasks', () => {
  test.use({ timezoneId: 'Australia/Sydney' })

  test('saves a local due time and reminds again after the same task is rescheduled', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-11-08T10:00:00+11:00') })
    let scheduled
    const lists = [
      { id: 'home', name: 'Home' },
      { id: 'work', name: 'Work' },
    ]
    await page.route('http://127.0.0.1:8799/api/tasks/**', (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const method = request.method()
      if (path.endsWith('/lists')) return route.fulfill({ json: lists })
      if (path.endsWith('/work/items')) {
        return route.fulfill({
          json: [
            { id: 'p1', list_id: 'work', status: 'needsAction', title: 'Parent task' },
            {
              id: 's1',
              list_id: 'work',
              parent_id: 'p1',
              status: 'needsAction',
              title: 'Starred subtask',
              starred: true,
            },
          ],
        })
      }
      if (method === 'POST' || method === 'PATCH') {
        scheduled = {
          id: 't1',
          list_id: 'home',
          status: 'needsAction',
          ...scheduled,
          ...request.postDataJSON(),
        }
        // PostgREST returns a timestamptz in UTC.
        return route.fulfill({
          json: { ...scheduled, due_at: new Date(scheduled.due_at).toISOString() },
        })
      }
      return route.fulfill({
        json: scheduled ? [{ ...scheduled, due_at: new Date(scheduled.due_at).toISOString() }] : [],
      })
    })

    await page.goto('/?app=tasks')
    const tasks = win(page, 'Tasks')
    await tasks.getByRole('button', { name: 'Starred', exact: true }).click()
    await expect(tasks.getByText('Starred subtask')).toBeVisible()
    await tasks.getByRole('button', { name: 'Home', exact: true }).click()
    await tasks.getByRole('button', { name: 'Add with details' }).click()
    await tasks.getByLabel('Task title').fill('Call the studio')
    await tasks.getByLabel('Due date').fill('2026-11-08')
    await tasks.getByLabel('Due time').fill('10:02')
    await tasks.getByRole('button', { name: 'Add task', exact: true }).click()
    await expect(tasks.getByLabel('Task title')).toBeHidden()
    expect(scheduled.due_at).toBe('2026-11-08T10:02:00+11:00')
    expect(scheduled.due_timezone).toBe('Australia/Sydney')

    await tasks.getByRole('button', { name: 'Minimize window' }).click()
    await page.clock.fastForward(2 * 60_000)
    const reminderToast = page.getByRole('tooltip').filter({ hasText: 'Call the studio' })
    await expect(reminderToast).toHaveCount(1)
    const actionCenter = page.getByRole('button', { name: /^Action Center/ })
    await expect(actionCenter).toHaveAccessibleName('Action Center, 1 unread')

    await page
      .getByRole('navigation', { name: 'Taskbar' })
      .getByRole('button', { name: 'Tasks', exact: true })
      .click()
    await tasks.getByRole('button', { name: /Call the studio Today/ }).click()
    await expect(tasks.getByLabel('Due time')).toHaveValue('10:02')
    await tasks.getByLabel('Due time').fill('10:04')
    await tasks.getByRole('button', { name: 'Save', exact: true }).press('Enter')
    await expect(tasks.getByLabel('Task title')).toBeHidden()
    expect(scheduled.due_at).toBe('2026-11-08T10:04:00+11:00')

    await tasks.getByRole('button', { name: 'Close window' }).click()
    await page.clock.fastForward(2 * 60_000)
    await expect(actionCenter).toHaveAccessibleName('Action Center, 2 unread')
    await actionCenter.click()
    await expect(
      page.getByRole('dialog', { name: 'Action Center' }).getByText('Call the studio'),
    ).toHaveCount(2)
  })

  test('claims a due reminder only once across two open Nexus tabs', async ({ page }) => {
    const other = await page.context().newPage()
    let checked = 0
    let raceArmed = false
    let release
    const bothChecking = new Promise((resolve) => {
      release = resolve
    })

    async function openReminderTab(tab) {
      await mockApi(tab)
      await tab.addInitScript(() => {
        sessionStorage.setItem('nexus_booted', '1')
        // Exercise the race when two windows remain visible on the desktop.
        Object.defineProperty(document, 'hidden', { get: () => false })
      })
      await tab.clock.install({ time: new Date('2026-11-08T10:00:00+11:00') })
      await tab.route('http://127.0.0.1:8799/api/tasks/lists', (route) =>
        route.fulfill({ json: [{ id: 'home', name: 'Home' }] }),
      )
      let joinedRace = false
      const itemsUrl = 'http://127.0.0.1:8799/api/tasks/lists/home/items?showCompleted=true'
      await tab.route(itemsUrl, async (route) => {
        if (raceArmed && !joinedRace) {
          joinedRace = true
          if (++checked === 2) release()
          await bothChecking
        }
        await route.fulfill({
          json: [
            {
              id: 'shared-reminder',
              list_id: 'home',
              status: 'needsAction',
              title: 'Pick up the order',
              due_at: '2026-11-07T23:00:45Z',
              all_day: false,
            },
          ],
        })
      })
      await tab.goto('/?app=tasks')
      await expect(win(tab, 'Tasks').getByText('Pick up the order', { exact: true })).toBeVisible()
    }

    try {
      await openReminderTab(page)
      await openReminderTab(other)
      raceArmed = true
      await Promise.all([page.clock.fastForward(45_000), other.clock.fastForward(45_000)])
      await Promise.all(
        [page, other].map((tab) => tab.evaluate(() => window.dispatchEvent(new Event('focus')))),
      )
      await expect.poll(() => checked).toBe(2)
      const toasts = [page, other].map((tab) =>
        tab.getByRole('tooltip').filter({ hasText: 'Pick up the order' }),
      )
      await expect.poll(async () => (await toasts[0].count()) + (await toasts[1].count())).toBe(1)
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              Object.keys(JSON.parse(localStorage.getItem('nexus-os:tasks:reminders-fired')).claims)
                .length,
          ),
        )
        .toBe(1)
    } finally {
      release()
      await other.close()
    }
  })
})

test.describe('desktop shell', () => {
  test('fine-pointer taskbar stays 40px (48px is touch-only)', async ({ page }) => {
    await openDesktop(page)
    expect(await page.evaluate(() => matchMedia('(pointer: fine)').matches)).toBe(true)
    const bar = await page.locator('.nx-taskbar').boundingBox()
    expect(Math.round(bar.height)).toBe(40)
  })

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
    // A reminder toast can cover the resize corner after dragging down and right.
    await page.route('http://127.0.0.1:8799/api/tasks/lists', (route) =>
      route.fulfill({ json: [] }),
    )
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
    await waitForStillBox(w)
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
    // Windows 7: a click does not unsnap; dragging restores the window under
    // the pointer and keeps dragging.
    await page.mouse.move(bb.x + 140, bb.y + 60, { steps: 6 })
    await page.mouse.up()
    // Un-snapping animates back to the restored rect (240ms); wait for it.
    await expect(w).not.toHaveClass(/is-maximized/)
    await expect
      .poll(async () => Math.round(Math.abs((await w.boundingBox()).width - 1000)))
      .toBeLessThan(2)
    await waitForStillBox(w)
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

  test('Show desktop undoes the desktop menu "Show the desktop" and keeps maximised state', async ({
    page,
  }) => {
    await openDesktop(page)
    await win(page, 'Media Vault').getByRole('button', { name: 'Maximize window' }).click()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Media Vault')).toBeHidden()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Media Vault')).toHaveClass(/is-maximized/)
    // Same again, but hidden from the desktop context menu this time.
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await win(page, 'Media Vault').getByRole('button', { name: 'Restore window' }).click()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Media Vault')).toBeVisible()
    // "Show the desktop" lives on the taskbar menu, as on Windows 7.
    const bar = await page.getByRole('navigation', { name: 'Taskbar' }).boundingBox()
    await page.mouse.click(bar.x + bar.width * 0.6, bar.y + bar.height / 2, { button: 'right' })
    await page
      .getByRole('menu', { name: 'Taskbar context menu' })
      .getByRole('menuitem', { name: /Show the desktop/ })
      .click()
    await expect(win(page, 'Media Vault')).toBeHidden()
    await page.getByRole('button', { name: 'Show desktop' }).click()
    await expect(win(page, 'Media Vault')).toBeVisible()
  })

  test('dialogs: default button takes focus; Escape closes only the top dialog', async ({
    page,
  }) => {
    await openDesktop(page)
    const media = win(page, 'Media Vault')
    // Vault list rows open from the keyboard.
    await media.getByRole('button', { name: 'To Read — open vault' }).click()
    // Rows are a roving-tabindex table: focus the first row, Enter opens it.
    const firstRow = media.getByRole('table').locator('[role="row"][tabindex]').first()
    await firstRow.focus()
    await page.keyboard.press('Enter')
    const details = page.getByRole('dialog')
    await expect(details).toBeVisible()
    // Book details has no text field, so its default button takes focus.
    await expect(details.locator('button.default')).toBeFocused()
    await details.getByRole('button', { name: 'Delete', exact: true }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible()
    // Default button has focus, not the caption close button.
    await expect(confirm.locator('button.default')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirm).toBeHidden()
    // The Book details dialog underneath stays open.
    await expect(details).toBeVisible()
  })

  test('desktop icons open apps; context menu works with the keyboard', async ({ page }) => {
    await openDesktop(page)
    await page
      .getByRole('listbox', { name: 'Desktop icons' })
      .getByRole('option', { name: 'Tasks', exact: true })
      .dblclick()
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
    // Persistence is debounced: wait until the saved layout records the maximise.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('nexus-os:window-layout') ?? ''))
      .toContain('"state":"maximized"')
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
    await page.getByRole('button', { name: 'Shut down options' }).click()
    await page.getByRole('menuitem', { name: 'Lock' }).click()
    await expect(page.getByTestId('app-launcher')).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Taskbar' })).toBeVisible()
    const lock = page.getByRole('dialog', { name: /Lock screen/ })
    await expect(lock).toBeVisible()
    // Stays locked after the triggering click: the checks below run after it.
    // Any key or click no longer unlocks: Windows 7 asks for the password.
    await page.keyboard.press('Enter')
    await page.mouse.click(600, 300)
    await expect(lock).toBeVisible()
    // The mocked /auth/login accepts the password (test data only).
    await lock.getByLabel('Password', { exact: true }).fill('e2e-password')
    await page.keyboard.press('Enter')
    await expect(lock).toBeHidden()
  })

  test('lock: a wrong password keeps the screen locked; the right one unlocks', async ({
    page,
  }) => {
    await openDesktop(page)
    // Only the test password passes; anything else is the backend's 401.
    await page.route('http://127.0.0.1:8799/auth/login', (route) => {
      if (route.request().postDataJSON()?.password === 'e2e-password') return route.fallback()
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Invalid credentials' }),
      })
    })
    await lockFromStart(page)
    const lock = page.getByRole('dialog', { name: /Lock screen/ })
    const password = lock.getByLabel('Password', { exact: true })
    await password.fill('not-the-password')
    await page.keyboard.press('Enter')
    await expect(lock.getByText('The password is incorrect. Try again.')).toBeVisible()
    await expect(lock).toBeVisible()
    await expect(password).toBeFocused()
    await password.fill('e2e-password')
    await page.keyboard.press('Enter')
    await expect(lock).toBeHidden()
    await expect(win(page, 'Media Vault')).toBeVisible()
  })
})

test.describe('snap and notification center', () => {
  test('Win+Right snaps the active window to the right half', async ({ page }) => {
    await openDesktop(page)
    const w = win(page, 'Media Vault')
    await w.getByTestId('titlebar').click({ position: { x: 300, y: 10 } })
    await page.keyboard.press('Meta+ArrowRight')
    await expect.poll(() => onRightHalf(w, page)).toBe(true)
  })

  test('dragging a window to the right edge snaps it to the right half', async ({ page }) => {
    await openDesktop(page)
    const w = win(page, 'Media Vault')
    const bb = await w.getByTestId('titlebar').boundingBox()
    await page.mouse.move(bb.x + 200, bb.y + 12)
    await page.mouse.down()
    await page.mouse.move(page.viewportSize().width - 2, 300, { steps: 10 })
    await page.mouse.up()
    await expect.poll(() => onRightHalf(w, page)).toBe(true)
  })

  test('Action Center opens from the tray and closes with Escape or its close button', async ({
    page,
  }) => {
    await openDesktop(page)
    const center = page.getByRole('dialog', { name: 'Action Center' })
    const tray = page.getByRole('button', { name: /^Action Center/ })
    await tray.click()
    await expect(center).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(center).toBeHidden()
    await tray.click()
    await expect(center).toBeVisible()
    await center.getByRole('button', { name: 'Close Action Center' }).click()
    await expect(center).toBeHidden()
  })
})

test.describe('signed out', () => {
  test('shows the Win7 logon screen and signs in through the form', async ({ page }) => {
    await page.unrouteAll()
    await mockApi(page, { authenticated: false })
    await page.goto('/')
    const email = page.getByLabel('Email', { exact: true })
    const password = page.getByLabel('Password', { exact: true })
    await expect(email).toBeVisible()
    await expect(password).toBeVisible()
    await email.fill('test.user@example.test')
    await password.fill('e2e-password')
    const login = page.waitForRequest(
      (req) => req.method() === 'POST' && req.url().endsWith('/auth/login'),
    )
    await page.getByRole('button', { name: 'Sign in' }).click()
    // The form submits the typed credentials to the login endpoint...
    expect((await login).postDataJSON()).toEqual({
      email: 'test.user@example.test',
      password: 'e2e-password',
    })
    // ...and the session it returns opens the desktop.
    await expect(win(page, 'Media Vault')).toBeVisible()
    await expect(page.getByLabel('Email', { exact: true })).toBeHidden()
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
    await page.getByTestId('app-launcher').getByRole('option', { name: /Notes/ }).click()
    // Newest window stacks on top of the full-screen Media Vault.
    await expect(page.getByRole('region', { name: 'Notes', exact: true })).toBeVisible()
  })

  test('touch taskbar is 48px with 44px task and tray targets', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mobile-window')).toBeVisible()
    // (pointer: coarse) must match under isMobile, or this test proves nothing.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)

    const bar = page.locator('.nx-taskbar')
    expect((await bar.boundingBox()).height).toBe(48)

    const taskButton = page.getByTestId('taskbar').locator('.nx-taskbtn').first()
    await expect(taskButton).toBeVisible()
    expect((await taskButton.boundingBox()).height).toBeGreaterThanOrEqual(44)

    const hidden = page.getByRole('button', { name: 'Show hidden icons' })
    expect((await hidden.boundingBox()).height).toBeGreaterThanOrEqual(44)

    const actionCenter = page.locator('.nx-tray-btn[aria-label^="Action Center"]')
    expect((await actionCenter.boundingBox()).height).toBeGreaterThanOrEqual(44)
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
