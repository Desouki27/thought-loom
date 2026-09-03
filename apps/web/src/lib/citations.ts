import type { Note } from './types'

export interface CitationPart {
  type: 'text' | 'citation'
  text: string
  noteId?: string
}

const CITATION_PATTERN = /\[\[note:([0-9a-fA-F-]+)\]\]/g

/**
 * Splits Ask Loom's streamed answer text on inline [[note:UUID]] citation
 * markers, so the UI can render each citation as a clickable chip.
 */
export function parseCitations(text: string): CitationPart[] {
  const parts: CitationPart[] = []
  let lastIndex = 0

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      parts.push({ type: 'text', text: text.slice(lastIndex, index) })
    }
    parts.push({ type: 'citation', text: match[0], noteId: match[1] })
    lastIndex = index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return parts
}

export function citedNoteTitle(noteId: string, notesById: Map<string, Note>): string {
  return notesById.get(noteId)?.title || 'note'
}
