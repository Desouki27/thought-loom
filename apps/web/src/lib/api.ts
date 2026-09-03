import { supabase } from './supabaseClient'
import type { Cluster, Note, NoteCluster, NoteLink } from './types'

// --- Notes -----------------------------------------------------------------

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createNote(title: string, content: string): Promise<Note> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const { data, error } = await supabase
    .from('notes')
    .insert({ title, content, user_id: userData.user.id })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateNote(
  id: string,
  fields: Partial<Pick<Note, 'title' | 'content'>>,
): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id)
  if (error) throw error
}

// --- Links -------------------------------------------------------------------

export async function listLinks(): Promise<NoteLink[]> {
  const { data, error } = await supabase.from('links').select('*')
  if (error) throw error
  return data
}

export async function listPendingLinksForNote(noteId: string): Promise<NoteLink[]> {
  const { data, error } = await supabase
    .from('links')
    .select('*')
    .eq('status', 'pending')
    .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`)
  if (error) throw error
  return data
}

export async function setLinkStatus(
  id: string,
  status: 'accepted' | 'dismissed',
): Promise<void> {
  const { error } = await supabase.from('links').update({ status }).eq('id', id)
  if (error) throw error
}

export async function createManualLink(
  sourceNoteId: string,
  targetNoteId: string,
): Promise<NoteLink> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const { data, error } = await supabase
    .from('links')
    .insert({
      source_note_id: sourceNoteId,
      target_note_id: targetNoteId,
      kind: 'manual',
      status: 'accepted',
      user_id: userData.user.id,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// --- Clusters ------------------------------------------------------------------

export async function listClusters(): Promise<Cluster[]> {
  const { data, error } = await supabase.from('clusters').select('*')
  if (error) throw error
  return data
}

export async function listNoteClusters(): Promise<NoteCluster[]> {
  const { data, error } = await supabase.from('note_clusters').select('*')
  if (error) throw error
  return data
}

// --- Edge functions --------------------------------------------------------

export async function embedNote(noteId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('embed-note', {
    body: { noteId },
  })
  if (error) throw error
}

export async function suggestLinks(noteId: string): Promise<NoteLink[]> {
  const { data, error } = await supabase.functions.invoke<{ links: NoteLink[] }>(
    'suggest-links',
    { body: { noteId } },
  )
  if (error) throw error
  return data?.links ?? []
}

export async function reweave(): Promise<void> {
  const { error } = await supabase.functions.invoke('cluster-notes', { body: {} })
  if (error) throw error
}

/**
 * Streams a synthesized answer from the ask-notes edge function.
 * Uses a raw fetch (not functions.invoke) because invoke buffers the
 * whole response instead of exposing a readable stream.
 */
export async function askLoomStream(
  question: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const res = await fetch(`${supabaseUrl}/functions/v1/ask-notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  })

  if (!res.ok || !res.body) {
    throw new Error(`ask-notes failed: ${res.status} ${await res.text()}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value, { stream: true }))
  }
}
