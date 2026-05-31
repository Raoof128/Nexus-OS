import { describe, it, expect } from 'vitest'
import { BIBLE_BOOKS, OT_BOOKS, NT_BOOKS, VOTD_POOL, getVerseOfTheDay } from '../bibleData'

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
