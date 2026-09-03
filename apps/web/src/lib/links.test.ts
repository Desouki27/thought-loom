import { describe, expect, it } from 'vitest'
import { otherNoteId, pendingLinksForNote } from './links'
import type { NoteLink } from './types'

function makeLink(overrides: Partial<NoteLink>): NoteLink {
  return {
    id: 'link-1',
    user_id: 'u1',
    source_note_id: 'a',
    target_note_id: 'b',
    kind: 'ai_suggested',
    reason: null,
    confidence: 0.8,
    status: 'pending',
    created_at: '',
    ...overrides,
  }
}

describe('pendingLinksForNote', () => {
  it('includes pending links where the note is the source', () => {
    const link = makeLink({ source_note_id: 'a', target_note_id: 'b' })
    expect(pendingLinksForNote([link], 'a')).toEqual([link])
  })

  it('includes pending links where the note is the target', () => {
    const link = makeLink({ source_note_id: 'a', target_note_id: 'b' })
    expect(pendingLinksForNote([link], 'b')).toEqual([link])
  })

  it('excludes links not touching the note', () => {
    const link = makeLink({ source_note_id: 'a', target_note_id: 'b' })
    expect(pendingLinksForNote([link], 'c')).toEqual([])
  })

  it('excludes accepted and dismissed links', () => {
    const accepted = makeLink({ id: 'l1', status: 'accepted' })
    const dismissed = makeLink({ id: 'l2', status: 'dismissed' })
    expect(pendingLinksForNote([accepted, dismissed], 'a')).toEqual([])
  })
})

describe('otherNoteId', () => {
  it('returns the target when queried from the source', () => {
    const link = makeLink({ source_note_id: 'a', target_note_id: 'b' })
    expect(otherNoteId(link, 'a')).toBe('b')
  })

  it('returns the source when queried from the target', () => {
    const link = makeLink({ source_note_id: 'a', target_note_id: 'b' })
    expect(otherNoteId(link, 'b')).toBe('a')
  })
})
