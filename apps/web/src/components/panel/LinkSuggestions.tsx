import { setLinkStatus } from '../../lib/api'
import type { Note, NoteLink } from '../../lib/types'

interface LinkSuggestionsProps {
  currentNoteId: string
  links: NoteLink[]
  notesById: Map<string, Note>
  onResolved: (linkId: string, status: 'accepted' | 'dismissed') => void
}

export function LinkSuggestions({
  currentNoteId,
  links,
  notesById,
  onResolved,
}: LinkSuggestionsProps) {
  const pending = links.filter(
    (l) =>
      l.status === 'pending' &&
      (l.source_note_id === currentNoteId || l.target_note_id === currentNoteId),
  )

  if (pending.length === 0) {
    return <p className="text-sm text-white/30">No pending suggestions for this note.</p>
  }

  return (
    <ul className="space-y-3">
      {pending.map((link) => {
        const otherId = link.source_note_id === currentNoteId ? link.target_note_id : link.source_note_id
        const other = notesById.get(otherId)
        return (
          <li key={link.id} className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
            <p className="text-sm font-medium text-white">{other?.title ?? 'Untitled'}</p>
            {link.reason && <p className="mt-1 text-xs text-white/60">{link.reason}</p>}
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  await setLinkStatus(link.id, 'accepted')
                  onResolved(link.id, 'accepted')
                }}
                className="rounded-md bg-violet-500 px-2 py-1 text-xs font-medium text-white hover:bg-violet-400"
              >
                Accept
              </button>
              <button
                onClick={async () => {
                  await setLinkStatus(link.id, 'dismissed')
                  onResolved(link.id, 'dismissed')
                }}
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
