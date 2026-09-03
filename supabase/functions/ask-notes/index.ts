import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { badGateway, badRequest, serverError, unauthorized } from '../_shared/http.ts'
import { getUserClient } from '../_shared/supabaseClient.ts'

const MATCH_COUNT = 6

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = getUserClient(req)
  if (!supabase) return unauthorized()

  const { question } = await req.json().catch(() => ({}))
  if (!question) return badRequest('question is required')

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return unauthorized()

  await supabase
    .from('chat_messages')
    .insert({ user_id: userId, role: 'user', content: question, cited_note_ids: [] })

  const embedRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: question }),
  })
  if (!embedRes.ok) return badGateway(`OpenAI embeddings request failed: ${await embedRes.text()}`)

  const embedData = await embedRes.json()
  const queryEmbedding = `[${embedData.data[0].embedding.join(',')}]`

  const { data: matches, error: matchError } = await supabase.rpc('match_notes', {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    exclude_note_id: null,
  })
  if (matchError) return serverError(matchError.message)

  const contextBlock = (matches ?? [])
    .map((m: { id: string; title: string; content: string }) => `Note id=${m.id} title="${m.title}"\n${m.content.slice(0, 800)}`)
    .join('\n\n---\n\n')

  const system =
    "You are Thought Loom's assistant. Answer the user's question using ONLY the notes given below as " +
    'context — weave together information across multiple notes when relevant. Whenever you state something ' +
    'drawn from a note, cite it inline immediately using exactly this syntax: [[note:NOTE_ID]] (the id given ' +
    "in the context, never the title). If the notes don't contain enough information, say so plainly. Be concise.\n\n" +
    `Notes:\n${contextBlock || '(no notes available yet)'}`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system,
      stream: true,
      messages: [{ role: 'user', content: question }],
    }),
  })

  if (!anthropicRes.ok || !anthropicRes.body) {
    return badGateway(`Anthropic request failed: ${await anthropicRes.text()}`)
  }

  let fullAnswer = ''
  const anthropicBody = anthropicRes.body

  const stream = new ReadableStream({
    async start(controller) {
      const reader = anthropicBody.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const event = JSON.parse(payload)
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              const text = event.delta.text as string
              fullAnswer += text
              controller.enqueue(encoder.encode(text))
            }
          } catch {
            // ignore malformed/keep-alive lines
          }
        }
      }

      const citedIds = [...fullAnswer.matchAll(/\[\[note:([0-9a-fA-F-]+)\]\]/g)].map((m) => m[1])
      await supabase.from('chat_messages').insert({
        user_id: userId,
        role: 'assistant',
        content: fullAnswer,
        cited_note_ids: [...new Set(citedIds)],
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
  })
})
