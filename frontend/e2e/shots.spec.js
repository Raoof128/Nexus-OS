// Screenshot capture of every app and shell surface (review aid, not an
// assertion suite). SHOTS_DIR=<dir> npx playwright test e2e/shots.spec.js
import { test, mockApi } from './fixtures.js'

const DIR = process.env.SHOTS_DIR || 'e2e/.results/shots'
const APPS = [
  ['media', 'Media Vault'],
  ['email', 'Email'],
  ['chat', 'AI Chat'],
  ['terminal', 'Terminal'],
  ['files', 'File Manager'],
  ['settings', 'Control Panel'],
  ['sysmon', 'System Monitor'],
  ['notes', 'Notes'],
  ['tasks', 'Tasks'],
  ['aion', 'Aion'],
]

test('desktop and Start menu', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('region', { name: 'Media Vault' }).waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/desktop-media.png` })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/start-menu.png` })
  await page.keyboard.press('Escape')
  await page.mouse.click(1300, 500, { button: 'right' })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${DIR}/context-menu.png` })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^Action Center/ }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/notification-center.png` })
})

for (const [id, title] of APPS) {
  test(`app ${id}`, async ({ page }) => {
    await page.goto(`/?app=${id}`)
    const w = page.getByRole('region', { name: title, exact: true })
    await w.waitFor()
    await w.getByRole('button', { name: 'Maximize window' }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${DIR}/app-${id}.png` })
  })
}

test('multiple windows, inactive frames', async ({ page }) => {
  await page.goto('/?app=notes')
  await page.getByRole('region', { name: 'Notes', exact: true }).waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/multi-window.png` })
})

test('lock screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('region', { name: 'Media Vault' }).waitFor()
  await page.getByRole('button', { name: 'Start' }).click()
  await page.getByRole('button', { name: 'Shut down options' }).click()
  await page.getByRole('menuitem', { name: 'Lock' }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${DIR}/lock-screen.png` })
})

test('signed out logon screen', async ({ page }) => {
  await page.unrouteAll()
  await mockApi(page, { authenticated: false })
  await page.goto('/')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${DIR}/logon.png` })
})

test('mobile @mobile', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mobile-window').first().waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/mobile-media.png` })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/mobile-start.png` })
})

test('dialogs: add book, book details', async ({ page }) => {
  await page.goto('/')
  const media = page.getByRole('region', { name: 'Media Vault', exact: true })
  await media.waitFor()
  await media.getByRole('button', { name: /Add Book/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DIR}/dialog-add-book.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await media
    .getByRole('button', { name: /delete/i })
    .first()
    .click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${DIR}/dialog-book-details.png` })
  await page.keyboard.press('Escape')
})

test('dialog: compose', async ({ page }) => {
  await page.goto('/?app=email')
  const email = page.getByRole('region', { name: 'Email', exact: true })
  await email.waitFor()
  await email.getByRole('button', { name: /Compose/ }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DIR}/dialog-compose.png` })
})
