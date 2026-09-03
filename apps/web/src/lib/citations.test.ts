import { describe, expect, it } from 'vitest'
import { citedNoteTitle, parseCitations } from './citations'
import type { Note } from './types'

describe('parseCitations', () => {
  it('returns a single text part when there are no citations', () => {
    expect(parseCitations('just plain text')).toEqual([
      { type: 'text', text: 'just plain text' },
    ])
  })

  it('splits out a single citation marker', () => {
    const id = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    expect(parseCitations(`before [[note:${id}]] after`)).toEqual([
      { type: 'text', text: 'before ' },
      { type: 'citation', text: `[[note:${id}]]`, noteId: id },
      { type: 'text', text: ' after' },
    ])
  })

  it('handles multiple citations with no text between them', () => {
    const a = '11111111-1111-1111-1111-111111111111'
    const b = '22222222-2222-2222-2222-222222222222'
    expect(parseCitations(`[[note:${a}]][[note:${b}]]`)).toEqual([
      { type: 'citation', text: `[[note:${a}]]`, noteId: a },
      { type: 'citation', text: `[[note:${b}]]`, noteId: b },
    ])
  })

  it('ignores malformed markers', () => {
    expect(parseCitations('[[note:not-a-uuid!!]] and [[note:]]')).toEqual([
      { type: 'text', text: '[[note:not-a-uuid!!]] and [[note:]]' },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(parseCitations('')).toEqual([])
  })
})

describe('citedNoteTitle', () => {
  it('resolves a known note id to its title', () => {
    const notesById = new Map<string, Note>([
      [
        'abc',
        {
          id: 'abc',
          user_id: 'u1',
          title: 'My Note',
          content: '',
          created_at: '',
          updated_at: '',
        },
      ],
    ])
    expect(citedNoteTitle('abc', notesById)).toBe('My Note')
  })

  it('falls back to "note" for an unknown id', () => {
    expect(citedNoteTitle('missing', new Map())).toBe('note')
  })
})
