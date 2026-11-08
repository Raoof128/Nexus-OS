import { describe, it, expect } from 'vitest'
import {
  baseNameLength,
  buildRows,
  filterRows,
  folderModifiedAt,
  folderTitle,
  nextAvailableName,
  pathChain,
  rangeNames,
  sortRows,
  stepHistory,
  typeLabel,
  validateEntryName,
} from '../FileManager/fileManagerUtils'

const FILES = {
  '/': { type: 'folder', name: '/', children: ['zeta', 'alpha', 'b.txt', 'a.pdf'] },
  '/zeta': { type: 'folder', name: 'zeta', children: ['inner.txt'] },
  '/alpha': { type: 'folder', name: 'alpha', children: [] },
  '/zeta/inner.txt': { type: 'file', name: 'inner.txt', size: 10, updatedAt: 500 },
  '/b.txt': { type: 'file', name: 'b.txt', size: 300, updatedAt: 100 },
  '/a.pdf': { type: 'file', name: 'a.pdf', size: 20, updatedAt: 300 },
}

describe('typeLabel', () => {
  it('uses Explorer names for folders and common extensions', () => {
    expect(typeLabel('anything', true)).toBe('File folder')
    expect(typeLabel('notes.txt', false)).toBe('Text Document')
    expect(typeLabel('report.pdf', false)).toBe('PDF File')
  })

  it('capitalises the generic fallback and handles extension-less names', () => {
    expect(typeLabel('data.xyz', false)).toBe('XYZ File')
    expect(typeLabel('README', false)).toBe('File')
    expect(typeLabel('trailing.', false)).toBe('File')
  })
})

describe('baseNameLength', () => {
  it('selects everything before the last dot for files', () => {
    expect(baseNameLength('report.pdf', false)).toBe(6)
    expect(baseNameLength('archive.tar.gz', false)).toBe(11)
  })

  it('selects the whole name for folders and dotfiles', () => {
    expect(baseNameLength('New folder', true)).toBe(10)
    expect(baseNameLength('.env', false)).toBe(4)
  })
})

describe('nextAvailableName', () => {
  it('pre-names new items and numbers collisions', () => {
    expect(nextAvailableName('New folder', '', [])).toBe('New folder')
    expect(nextAvailableName('New folder', '', ['New folder'])).toBe('New folder (2)')
    expect(
      nextAvailableName('New Text Document', '.txt', [
        'New Text Document.txt',
        'New Text Document (2).txt',
      ]),
    ).toBe('New Text Document (3).txt')
  })
})

describe('validateEntryName', () => {
  it('rejects empty, reserved and invalid names', () => {
    expect(validateEntryName('   ', []).error).toBe('Type a name.')
    expect(validateEntryName('..', []).error).toBe('That name is not allowed.')
    expect(validateEntryName('a/b', []).error).toMatch(/can't contain/)
  })

  it('rejects duplicates but lets a rename keep its own name', () => {
    expect(validateEntryName('alpha', ['alpha']).error).toMatch(/already exists/)
    expect(validateEntryName('alpha', ['alpha'], 'alpha').error).toBeNull()
  })

  it('treats names case-insensitively, as Windows does, but allows a case-only rename', () => {
    expect(validateEntryName('ALPHA', ['alpha']).error).toMatch(/already exists/)
    expect(validateEntryName('Alpha', ['alpha'], 'alpha').error).toBeNull()
  })

  it('returns the trimmed name', () => {
    expect(validateEntryName('  notes.txt  ', []).name).toBe('notes.txt')
  })
})

describe('sorting and rows', () => {
  it('builds rows with type, size and modified stamps', () => {
    const rows = buildRows(FILES, '/')
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]))
    expect(byName['b.txt'].size).toBe(300)
    expect(byName.zeta.isFolder).toBe(true)
    expect(byName.zeta.size).toBeNull()
  })

  it('derives a folder date from its newest child', () => {
    expect(folderModifiedAt(FILES, '/zeta')).toBe(500)
    expect(folderModifiedAt(FILES, '/alpha')).toBeNull()
  })

  it('keeps folders first and reverses only within each group', () => {
    const rows = buildRows(FILES, '/')
    const asc = sortRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.name)
    expect(asc).toEqual(['alpha', 'zeta', 'a.pdf', 'b.txt'])
    const desc = sortRows(rows, { key: 'size', dir: 'desc' }).map((r) => r.name)
    expect(desc).toEqual(['zeta', 'alpha', 'b.txt', 'a.pdf'])
  })

  it('sorts names with numeric collation', () => {
    const rows = [
      { name: 'item10', isFolder: false },
      { name: 'item2', isFolder: false },
    ]
    expect(sortRows(rows, { key: 'name', dir: 'asc' }).map((r) => r.name)).toEqual([
      'item2',
      'item10',
    ])
  })

  it('filters by name case-insensitively', () => {
    const rows = buildRows(FILES, '/')
    expect(filterRows(rows, 'PDF').map((r) => r.name)).toEqual(['a.pdf'])
    expect(filterRows(rows, '  ')).toHaveLength(4)
  })

  it('returns an inclusive range in display order', () => {
    const names = ['a', 'b', 'c', 'd']
    expect(rangeNames(names, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeNames(names, 'a', 'gone')).toEqual(['gone'])
  })
})

describe('paths and history', () => {
  it('builds the ancestor chain and the window title', () => {
    expect(pathChain('/documents/sub')).toEqual(['/', '/documents', '/documents/sub'])
    expect(folderTitle('/documents/sub')).toBe('sub')
    expect(folderTitle('/')).toBe('File Manager')
  })

  it('skips deleted folders when stepping through history', () => {
    const files = { '/': { type: 'folder' }, '/b': { type: 'folder' } }
    const nav = { entries: ['/', '/gone', '/b'], index: 2 }
    expect(stepHistory(nav, files, -1)).toBe(0)
    expect(stepHistory({ entries: ['/', '/b'], index: 1 }, files, 1)).toBeNull()
  })
})
