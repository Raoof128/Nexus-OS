// PWA launch paths: ?app= deep links and the Web Share Target (final audit,
// ARCH-01). Runs against the dev server, so StrictMode double effects apply.
import { test, expect, mockApi } from './fixtures.js'
test('deep link opens its app on top of a restored layout (dev StrictMode)', async ({ page }) => {
  await mockApi(page)
  await page.goto('/')
  await page.getByRole('region', { name: 'Media Vault' }).waitFor()
  await page.waitForTimeout(700) // let the debounced layout save land
  await page.goto('/?app=files')
  await expect(page.getByRole('region', { name: 'File Manager' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Media Vault' })).toBeVisible()
})

test('a retired deep link opens the Nexus desktop without an app shortcut', async ({ page }) => {
  await page.goto('/?app=aion')
  await expect(page.getByRole('region', { name: 'Media Vault' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Aion', exact: true })).toHaveCount(0)
  await expect(page).not.toHaveURL(/app=aion/)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Start menu' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Aion', exact: true })).toHaveCount(0)
})
test('share target opens Notes with the shared text', async ({ page }) => {
  await mockApi(page)
  await page.goto('/?share-target=1&title=Hi&text=Hello%20there')
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Notes' }).locator('textarea')).toHaveValue(
    /Hello there/,
  )
  expect(page.url()).not.toContain('share-target')
})
