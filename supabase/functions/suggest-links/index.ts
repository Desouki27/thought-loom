import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { badGateway, badRequest, json, notFound, serverError, unauthorized } from '../_shared/http.ts'
import { getUserClient } from '../_shared/supabaseClient.ts'

const MATCH_COUNT = 6
const SIMILARITY_FLOOR = 0.72
const CONFIDENCE_FLOOR = 0.5

interface Candidate {
  id: string
  title: string
  content: string
  similarity: number
}

interface Reasoned {
  id: string
  related: boolean
  confidence: number
  reason: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = getUserClient(req)
  if (!supabase) return unauthorized()

  const { noteId } = await req.json().catch(() => ({}))
  if (!noteId) return badRequest('noteId is required')

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, title, content, embedding')
    .eq('id', noteId)
    .single()

  if (noteError || !note) return notFound(noteError?.message)
  if (!note.embedding) return json({ links: [] })

  const { data: candidates, error: matchError } = await supabase.rpc('match_notes', {
    query_embedding: note.embedding,
    match_count: MATCH_COUNT,
    exclude_note_id: noteId,
  })
  if (matchError) return serverError(matchError.message)

  const strong = ((candidates ?? []) as Candidate[]).filter((c) => c.similarity >= SIMILARITY_FLOOR)
  if (strong.length === 0) return json({ links: [] })

  const { data: existingLinks, error: existingError } = await supabase
    .from('links')
    .select('source_note_id, target_note_id')
    .or(`source_note_id.eq.${noteId},target_note_id.eq.${noteId}`)
  if (existingError) return serverError(existingError.message)

  const alreadyLinked = new Set(
    (existingLinks ?? []).flatMap((l) => [l.source_note_id, l.target_note_id]),
  )
  alreadyLinked.delete(noteId)

  const toEvaluate = strong.filter((c) => !alreadyLinked.has(c.id))
  if (toEvaluate.length === 0) return json({ links: [] })

  let reasoned: Reasoned[]
  try {
    reasoned = await reasonAboutLinks(note, toEvaluate)
  } catch (err) {
    return badGateway((err as Error).message)
  }

  const relevant = reasoned.filter((r) => r.related && r.confidence >= CONFIDENCE_FLOOR)
  if (relevant.length === 0) return json({ links: [] })

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return unauthorized()

  const rows = relevant.map((r) => ({
    user_id: userId,
    source_note_id: noteId,
    target_note_id: r.id,
    kind: 'ai_suggested',
    status: 'pending',
    reason: r.reason,
    confidence: r.confidence,
  }))

  const { data: inserted, error: insertError } = await supabase.from('links').insert(rows).select()
  if (insertError) return serverError(insertError.message)

  return json({ links: inserted })
})

async function reasonAboutLinks(
  note: { title: string; content: string },
  candidates: Candidate[],
): Promise<Reasoned[]> {
  const candidateBlock = candidates
    .map((c, i) => `${i + 1}. id=${c.id} title="${c.title}"\n${c.content.slice(0, 400)}`)
    .join('\n\n')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      tools: [
        {
          name: 'report_links',
          description: 'Report which candidate notes are genuinely related to the source note.',
          input_schema: {
            type: 'object',
            properties: {
              links: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    related: { type: 'boolean' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reason: { type: 'string', description: 'One short sentence.' },
                  },
                  required: ['id', 'related', 'confidence', 'reason'],
                },
              },
            },
            required: ['links'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'report_links' },
      messages: [
        {
          role: 'user',
          content:
            `Source note:\ntitle="${note.title}"\n${note.content.slice(0, 1500)}\n\n` +
            `Candidate notes (already filtered by embedding similarity):\n${candidateBlock}\n\n` +
            'For each candidate, decide whether it is genuinely conceptually related to the source note ' +
            '(not just superficially similar wording). Give a one-sentence reason and a confidence from 0 to 1.',
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic request failed: ${await res.text()}`)

  const data = await res.json()
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use')
  return (toolUse?.input?.links ?? []) as Reasoned[]
}
