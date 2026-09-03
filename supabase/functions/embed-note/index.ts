import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { badGateway, badRequest, json, notFound, serverError, unauthorized } from '../_shared/http.ts'
import { getUserClient } from '../_shared/supabaseClient.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = getUserClient(req)
  if (!supabase) return unauthorized()

  const { noteId } = await req.json().catch(() => ({}))
  if (!noteId) return badRequest('noteId is required')

  const { data: note, error: noteError } = await supabase
    .from('notes')
    .select('id, title, content')
    .eq('id', noteId)
    .single()

  if (noteError || !note) return notFound(noteError?.message)

  const input = `${note.title}\n\n${note.content}`.trim() || 'empty note'

  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input }),
  })

  if (!embedRes.ok) return badGateway(`OpenAI embeddings request failed: ${await embedRes.text()}`)

  const embedData = await embedRes.json()
  const embedding: number[] = embedData.data[0].embedding
  // pgvector reads its bracketed text form; supabase-js/PostgREST casts the
  // string straight to the `vector` column type.
  const embeddingLiteral = `[${embedding.join(',')}]`

  const { error: updateError } = await supabase
    .from('notes')
    .update({ embedding: embeddingLiteral })
    .eq('id', noteId)

  if (updateError) return serverError(updateError.message)

  return json({ ok: true })
})
