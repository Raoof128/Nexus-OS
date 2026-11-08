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
