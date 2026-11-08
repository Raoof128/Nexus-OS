// Privacy: does a second account on the same browser see the first
// account's local files and notes? Runs with the repo's Playwright config.
import { test, expect, mockApi } from './fixtures.js'

const OTHER_USER = '00000000-0000-4000-8000-0000000000bb'
const fsWithSecret = JSON.stringify({
  schemaVersion: 1,
  currentPath: '/',
  files: {
    '/': { type: 'folder', name: '/', children: ['documents', 'downloads'] },
    '/documents': { type: 'folder', name: 'documents', children: ['bank-pins.txt'] },
    '/documents/bank-pins.txt': {
      type: 'file',
      name: 'bank-pins.txt',
      content: 'A secret',
      createdAt: 1,
      updatedAt: 1,
    },
    '/downloads': { type: 'folder', name: 'downloads', children: [] },
  },
})

for (const [label, owner, expectVisible] of [
  ['different account', OTHER_USER, false],
  ['same account', '00000000-0000-4000-8000-000000000001', true],
]) {
  test(`local files for ${label}`, async ({ page }) => {
    await page.addInitScript(
      ([fs, own]) => {
        if (sessionStorage.getItem('seeded')) return
        sessionStorage.setItem('seeded', '1')
        localStorage.setItem('nexus-os:owner', own)
        localStorage.setItem('nexus-os:filesystem', fs)
        localStorage.setItem('nexus-os:note-notes-zzz', 'A private note')
        // Current Notes model (Notes/noteStore.js) as well as the legacy key.
        localStorage.setItem('nexus-os:notes:index', JSON.stringify([{ id: 'n1', updatedAt: 1 }]))
        localStorage.setItem('nexus-os:notes:n1', 'A private note')
      },
      [fsWithSecret, owner],
    )
    await mockApi(page)
    await page.goto('/?app=files')
    await page.getByRole('region', { name: 'File Manager' }).waitFor()
    await page
      .getByRole('treeitem', { name: /documents/ })
      .first()
      .dblclick()
    await page.waitForTimeout(500)
    const visible = await page.getByText('bank-pins.txt').count()
    const note = await page.evaluate(
      () =>
        localStorage.getItem('nexus-os:note-notes-zzz') ??
        localStorage.getItem('nexus-os:notes:n1'),
    )
    const ownerNow = await page.evaluate(() => localStorage.getItem('nexus-os:owner'))
    expect(ownerNow).toBe('00000000-0000-4000-8000-000000000001')
    expect(visible > 0).toBe(expectVisible)
    expect(note !== null).toBe(expectVisible)
  })
}

// Review finding (final audit): a tab still signed in as account A wrote A's
// whole file tree back after another tab signed in as B and wiped the data.
// Both tabs share one cookie in real browsers, so the mocked session below is
// shared too: once B signs in, every tab's next /auth/session says B.
test('a stale tab from the previous account cannot write its files back', async ({ context }) => {
  const A = '00000000-0000-4000-8000-000000000001'
  let currentUser = A
  const signedInAs = async (page) => {
    await mockApi(page)
    await page.route('**/auth/session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: currentUser, email: 'u@x.test', user_metadata: {} },
          expires_at: 9999999999,
        }),
      }),
    )
  }

  // Tab 1: account A with a private file, File Manager open.
  const tab1 = await context.newPage()
  await signedInAs(tab1)
  await tab1.addInitScript(
    ([fs, owner]) => {
      if (sessionStorage.getItem('seeded')) return
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('nexus-os:owner', owner)
      localStorage.setItem('nexus-os:filesystem', fs)
    },
    [fsWithSecret, A],
  )
  await tab1.goto('/?app=files')
  await tab1.getByRole('region', { name: 'File Manager' }).waitFor()

  // Tab 2: account B signs in on the same browser; the private data is wiped.
  currentUser = OTHER_USER
  const tab2 = await context.newPage()
  await signedInAs(tab2)
  await tab2.goto('/')
  await expect
    .poll(() => tab2.evaluate(() => localStorage.getItem('nexus-os:owner')))
    .toBe(OTHER_USER)

  // Tab 1 still had A's tree in memory. It makes a normal change: a new folder.
  // That must not put A's file back into storage (the tab reloads as the new
  // owner, and the stores refuse to write for a stale owner).
  // With the fix, the storage event makes tab 1 reload as the new owner (its
  // File Manager window is gone); open one again so the same change is made.
  const fileManager = tab1.getByRole('region', { name: 'File Manager' })
  await tab1.waitForTimeout(500)
  await tab1.waitForLoadState()
  if (!(await fileManager.isVisible())) await tab1.goto('/?app=files')
  await fileManager.waitFor()
  await tab1.getByRole('button', { name: 'New folder' }).first().click()
  await tab1.keyboard.press('Enter')
  await expect(tab1.getByText('New folder', { exact: true }).first()).toBeVisible()
  // Wait past the 500 ms debounced save, then read storage once. (A polled
  // "not.toContain" would pass before the write lands and prove nothing.)
  await tab1.waitForTimeout(1200)
  const stored = await tab2.evaluate(() => localStorage.getItem('nexus-os:filesystem') ?? '')
  expect(stored).not.toContain('bank-pins')

  // A fresh tab as B never sees A's file.
  const tab3 = await context.newPage()
  await signedInAs(tab3)
  await tab3.goto('/?app=files')
  await tab3.getByRole('region', { name: 'File Manager' }).waitFor()
  await tab3
    .getByRole('treeitem', { name: /documents/ })
    .first()
    .dblclick()
  await expect(tab3.getByText('bank-pins.txt')).toHaveCount(0)
})
