// Ad-hoc screenshot capture used during the redesign (not an assertion suite).
// SHOTS_DIR=<dir> npx playwright test e2e/shots.spec.js
import { test } from './fixtures.js'

const DIR = process.env.SHOTS_DIR || 'e2e/.results/shots'

test('desktop overview', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('region', { name: 'Media Vault' }).waitFor()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/desktop-media.png` })
  await page.getByRole('button', { name: 'Start' }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${DIR}/start-menu.png` })
})
