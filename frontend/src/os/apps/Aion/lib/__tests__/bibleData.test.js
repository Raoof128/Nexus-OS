import { describe, it, expect } from 'vitest'
import {
  BIBLE_BOOKS,
  OT_BOOKS,
  NT_BOOKS,
  VOTD_POOL,
  getVerseOfTheDay,
  BSB_OMITTED_VERSES,
  getOmittedVerses,
} from '../bibleData'

describe('BIBLE_BOOKS', () => {
  it('has 66 books', () => {
    expect(BIBLE_BOOKS).toHaveLength(66)
  })

  it('every book has id, name, chapters, testament', () => {
    for (const book of BIBLE_BOOKS) {
      expect(book).toHaveProperty('id')
      expect(book).toHaveProperty('name')
      expect(typeof book.chapters).toBe('number')
      expect(['OT', 'NT']).toContain(book.testament)
    }
  })
})

describe('OT_BOOKS / NT_BOOKS', () => {
  it('OT + NT = 66', () => {
    expect(OT_BOOKS.length + NT_BOOKS.length).toBe(66)
  })

  it('OT has 39 books', () => {
    expect(OT_BOOKS).toHaveLength(39)
  })

  it('NT has 27 books', () => {
    expect(NT_BOOKS).toHaveLength(27)
  })
})

describe('getVerseOfTheDay', () => {
  it('returns a verse with required fields', () => {
    const votd = getVerseOfTheDay()
    expect(votd).toHaveProperty('book_id')
    expect(votd).toHaveProperty('book_name')
    expect(typeof votd.chapter).toBe('number')
    expect(typeof votd.verse).toBe('number')
    expect(typeof votd.content).toBe('string')
    expect(votd.content.length).toBeGreaterThan(0)
  })

  it('returns deterministically for the same day', () => {
    expect(getVerseOfTheDay()).toEqual(getVerseOfTheDay())
  })

  it('VOTD_POOL has at least 15 verses', () => {
    expect(VOTD_POOL.length).toBeGreaterThanOrEqual(15)
  })
})

describe('BSB_OMITTED_VERSES / getOmittedVerses', () => {
  it('covers exactly the 16 standard BSB critical-text omissions', () => {
    const total = Object.values(BSB_OMITTED_VERSES).reduce((n, arr) => n + arr.length, 0)
    expect(total).toBe(16)
  })

  it('returns the omitted verse for a known gap (Matthew 17:21)', () => {
    expect(getOmittedVerses('MAT', 17)).toEqual([21])
  })

  it('returns both omitted verses in Mark 9 (44 and 46)', () => {
    expect(getOmittedVerses('MRK', 9)).toEqual([44, 46])
  })

  it('accepts a string chapter (reader passes Number()-able values)', () => {
    expect(getOmittedVerses('ACT', '8')).toEqual([37])
  })

  it('returns an empty array for chapters with no omissions', () => {
    expect(getOmittedVerses('PSA', 23)).toEqual([])
    expect(getOmittedVerses('GEN', 1)).toEqual([])
  })

  it('only references real books and in-range chapters', () => {
    for (const key of Object.keys(BSB_OMITTED_VERSES)) {
      const [bookId, chapter] = key.split('-')
      const book = BIBLE_BOOKS.find((b) => b.id === bookId)
      expect(book, `book ${bookId} should exist`).toBeTruthy()
      expect(Number(chapter)).toBeLessThanOrEqual(book.chapters)
    }
  })
})
