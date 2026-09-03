import { useState, type FormEvent } from 'react'
import { askLoomStream } from '../../lib/api'
import { citedNoteTitle, parseCitations } from '../../lib/citations'
import type { Note } from '../../lib/types'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AskLoomProps {
  notesById: Map<string, Note>
  onCiteNote: (noteId: string) => void
}

/**
 * The ask-notes edge function emits inline citation markers like [[note:UUID]]
 * in the streamed text; we render those as clickable chips instead of raw text.
 */
function renderWithCitations(
  text: string,
  notesById: Map<string, Note>,
  onCiteNote: (noteId: string) => void,
) {
  return parseCitations(text).map((part, i) => {
    if (part.type === 'text') return <span key={i}>{part.text}</span>
    return (
      <button
        key={i}
        onClick={() => onCiteNote(part.noteId!)}
        className="mx-0.5 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs text-violet-200 hover:bg-violet-500/30"
      >
        {citedNoteTitle(part.noteId!, notesById)}
      </button>
    )
  })
}

export function AskLoom({ notesById, onCiteNote }: AskLoomProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!question.trim() || asking) return

    const q = question
    setQuestion('')
    setMessages((m) => [...m, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setAsking(true)

    try {
      await askLoomStream(q, (chunk) => {
        setMessages((m) => {
          const next = [...m]
          const last = next[next.length - 1]
          next[next.length - 1] = { ...last, content: last.content + chunk }
          return next
        })
      })
    } catch (err) {
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = {
          role: 'assistant',
          content: `Something went wrong: ${(err as Error).message}`,
        }
        return next
      })
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-white/30">
            Ask a question and Thought Loom will weave an answer from your notes.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'ml-6 rounded-lg bg-white/10 px-3 py-2 text-sm text-white'
                : 'mr-6 rounded-lg border border-violet-400/20 bg-violet-400/5 px-3 py-2 text-sm text-white/90'
            }
          >
            {m.role === 'assistant' ? renderWithCitations(m.content, notesById, onCiteNote) : m.content}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask your notes…"
          className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
        />
        <button
          type="submit"
          disabled={asking}
          className="rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </div>
  )
}
