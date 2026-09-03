import type { NoteLink } from './types'

/** Pending AI-suggested links touching the given note, either as source or target. */
export function pendingLinksForNote(links: NoteLink[], noteId: string): NoteLink[] {
  return links.filter(
    (l) => l.status === 'pending' && (l.source_note_id === noteId || l.target_note_id === noteId),
  )
}

/** The id of the note on the other end of a link from the given note's perspective. */
export function otherNoteId(link: NoteLink, fromNoteId: string): string {
  return link.source_note_id === fromNoteId ? link.target_note_id : link.source_note_id
}
