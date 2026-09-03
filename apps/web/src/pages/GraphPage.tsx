import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { LinkSuggestions } from '../components/panel/LinkSuggestions'
import {
  createNote,
  deleteNote,
  listClusters,
  listLinks,
  listNoteClusters,
  listNotes,
  reweave,
} from '../lib/api'
import { supabase } from '../lib/supabaseClient'
import type { Cluster, Note, NoteCluster, NoteLink } from '../lib/types'

const LoomGraph = lazy(() =>
  import('../components/graph/LoomGraph').then((m) => ({ default: m.LoomGraph })),
)
const NoteEditor = lazy(() =>
  import('../components/editor/NoteEditor').then((m) => ({ default: m.NoteEditor })),
)
const AskLoom = lazy(() =>
  import('../components/chat/AskLoom').then((m) => ({ default: m.AskLoom })),
)

type PanelTab = 'links' | 'ask'

export function GraphPage() {
  const [notes, setNotes] = useState<Note[]>([])
  const [links, setLinks] = useState<NoteLink[]>([])
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [noteClusters, setNoteClusters] = useState<NoteCluster[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [tab, setTab] = useState<PanelTab>('links')
  const [loading, setLoading] = useState(true)
  const [reweaving, setReweaving] = useState(false)
  const [reweaveError, setReweaveError] = useState<string | null>(null)

  async function refreshAll() {
    const [n, l, c, nc] = await Promise.all([
      listNotes(),
      listLinks(),
      listClusters(),
      listNoteClusters(),
    ])
    setNotes(n)
    setLinks(l)
    setClusters(c)
    setNoteClusters(nc)
    setLoading(false)
  }

  useEffect(() => {
    // Initial data loading synchronizes with Supabase; state updates happen after the requests settle.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshAll()
    // oxlint-disable-next-line exhaustive-deps
  }, [])

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const selectedNote = selectedNoteId ? (notesById.get(selectedNoteId) ?? null) : null

  async function handleNewNote() {
    const note = await createNote('Untitled', '')
    setNotes((prev) => [note, ...prev])
    setSelectedNoteId(note.id)
    setTab('links')
  }

  async function handleDeleteNote(id: string) {
    await deleteNote(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
    setLinks((prev) => prev.filter((l) => l.source_note_id !== id && l.target_note_id !== id))
    if (selectedNoteId === id) setSelectedNoteId(null)
  }

  async function handleReweave() {
    setReweaving(true)
    setReweaveError(null)
    try {
      await reweave()
      const [c, nc] = await Promise.all([listClusters(), listNoteClusters()])
      setClusters(c)
      setNoteClusters(nc)
    } catch (err) {
      setReweaveError((err as Error).message)
    } finally {
      setReweaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-wide text-white">🧵 Thought Loom</h1>
        <div className="flex items-center gap-3">
          {reweaveError && (
            <span className="text-xs text-amber-400/80" title={reweaveError}>
              Re-weave failed
            </span>
          )}
          <button
            onClick={handleReweave}
            disabled={reweaving || notes.length === 0}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:text-white disabled:opacity-40"
          >
            {reweaving ? 'Re-weaving…' : 'Re-weave'}
          </button>
          <button
            onClick={handleNewNote}
            className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-400"
          >
            New note
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-white/40">Loading…</div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-white/40">Loading graph…</div>
              }
            >
              <LoomGraph
                notes={notes}
                links={links}
                clusters={clusters}
                noteClusters={noteClusters}
                onSelectNote={setSelectedNoteId}
                selectedNoteId={selectedNoteId}
              />
            </Suspense>
          )}
        </div>

        <div className="flex w-105 shrink-0 flex-col border-l border-white/10">
          {selectedNote ? (
            <>
              <div className="min-h-0 flex-1">
                <Suspense fallback={<div className="p-4 text-sm text-white/40">Loading editor…</div>}>
                  <NoteEditor
                    key={selectedNote.id}
                    note={selectedNote}
                    onNoteSaved={(saved) =>
                      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)))
                    }
                    onLinksSuggested={(newLinks) =>
                      setLinks((prev) => [
                        ...prev.filter((l) => !newLinks.some((nl) => nl.id === l.id)),
                        ...newLinks,
                      ])
                    }
                    onDelete={() => handleDeleteNote(selectedNote.id)}
                  />
                </Suspense>
              </div>
              <div className="h-64 shrink-0 border-t border-white/10">
                <div className="flex border-b border-white/10 text-xs">
                  <button
                    onClick={() => setTab('links')}
                    className={`flex-1 py-2 ${tab === 'links' ? 'text-white' : 'text-white/40'}`}
                  >
                    Suggested links
                  </button>
                  <button
                    onClick={() => setTab('ask')}
                    className={`flex-1 py-2 ${tab === 'ask' ? 'text-white' : 'text-white/40'}`}
                  >
                    Ask Loom
                  </button>
                </div>
                <div className="h-[calc(100%-33px)] overflow-auto p-3">
                  {tab === 'links' ? (
                    <LinkSuggestions
                      currentNoteId={selectedNote.id}
                      links={links}
                      notesById={notesById}
                      onResolved={(linkId, status) =>
                        setLinks((prev) =>
                          prev.map((l) => (l.id === linkId ? { ...l, status } : l)),
                        )
                      }
                    />
                  ) : (
                    <Suspense fallback={<div className="text-white/40">Loading Ask Loom…</div>}>
                      <AskLoom notesById={notesById} onCiteNote={setSelectedNoteId} />
                    </Suspense>
                  )}
                </div>
              </div>
            </>
          ) : (
            <Suspense fallback={<div className="p-4 text-white/40">Loading Ask Loom…</div>}>
              <AskLoom notesById={notesById} onCiteNote={setSelectedNoteId} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  )
}
