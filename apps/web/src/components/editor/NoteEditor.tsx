import MDEditor from '@uiw/react-md-editor'
import { useEffect, useRef, useState } from 'react'
import { embedNote, suggestLinks, updateNote } from '../../lib/api'
import type { Note, NoteLink } from '../../lib/types'

const SAVE_DEBOUNCE_MS = 900

interface NoteEditorProps {
  note: Note
  onNoteSaved: (note: Note) => void
  onLinksSuggested: (links: NoteLink[]) => void
  onDelete: () => void
}

export function NoteEditor({ note, onNoteSaved, onLinksSuggested, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [status, setStatus] = useState<'idle' | 'saving' | 'weaving' | 'weave-failed'>('idle')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function save() {
    setStatus('saving')
    const saved = await updateNote(note.id, { title, content })
    onNoteSaved(saved)
    setStatus('weaving')
    try {
      await embedNote(saved.id)
      const links = await suggestLinks(saved.id)
      onLinksSuggested(links)
      setStatus('idle')
    } catch {
      // Embedding/link-suggesting is best-effort (e.g. AI keys not configured
      // yet, or a transient API failure) — the note itself already saved.
      setStatus('weave-failed')
    }
  }

  useEffect(() => {
    if (title === note.title && content === note.content) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(save, SAVE_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // oxlint-disable-next-line exhaustive-deps
  }, [title, content])

  return (
    <div className="flex h-full flex-col" data-color-mode="dark">
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="flex-1 bg-transparent text-lg font-medium text-white outline-none placeholder:text-white/30"
        />
        <span className="text-xs text-white/40">
          {status === 'saving' && 'Saving…'}
          {status === 'weaving' && 'Weaving…'}
          {status === 'weave-failed' && (
            <span className="text-amber-400/80" title="Note saved, but embedding/link suggestions failed">
              Saved (weave failed)
            </span>
          )}
        </span>
        <button
          onClick={onDelete}
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/50 hover:border-red-400/40 hover:text-red-300"
        >
          Delete
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <MDEditor
          value={content}
          onChange={(v) => setContent(v ?? '')}
          height="100%"
          preview="edit"
          visibleDragbar={false}
        />
      </div>
    </div>
  )
}
