export interface Note {
  id: string
  user_id: string
  title: string
  content: string
  created_at: string
  updated_at: string
}

export type LinkKind = 'manual' | 'ai_suggested'
export type LinkStatus = 'pending' | 'accepted' | 'dismissed'

export interface NoteLink {
  id: string
  user_id: string
  source_note_id: string
  target_note_id: string
  kind: LinkKind
  reason: string | null
  confidence: number | null
  status: LinkStatus
  created_at: string
}

export interface Cluster {
  id: string
  user_id: string
  label: string
  summary: string
  created_at: string
  updated_at: string
}

export interface NoteCluster {
  note_id: string
  cluster_id: string
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  user_id: string
  role: ChatRole
  content: string
  cited_note_ids: string[]
  created_at: string
}
