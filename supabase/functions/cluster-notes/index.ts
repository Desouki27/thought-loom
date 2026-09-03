import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { badGateway, json, serverError, unauthorized } from '../_shared/http.ts'
import { getUserClient } from '../_shared/supabaseClient.ts'

interface NoteRow {
  id: string
  title: string
  content: string
  embedding: string
}

interface LabeledCluster {
  index: number
  label: string
  summary: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = getUserClient(req)
  if (!supabase) return unauthorized()

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData.user?.id
  if (!userId) return unauthorized()

  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id, title, content, embedding')
    .not('embedding', 'is', null)

  if (notesError) return serverError(notesError.message)
  if (!notes || notes.length < 2) return json({ clusters: [] })

  const vectors = (notes as NoteRow[]).map((n) => normalize(parseVector(n.embedding)))
  const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(vectors.length / 2)), vectors.length))
  const assignments = kmeans(vectors, k)

  const groups = new Map<number, NoteRow[]>()
  ;(notes as NoteRow[]).forEach((note, i) => {
    const c = assignments[i]
    if (!groups.has(c)) groups.set(c, [])
    groups.get(c)!.push(note)
  })
  const groupList = [...groups.values()].filter((g) => g.length > 0)

  let labels: LabeledCluster[]
  try {
    labels = await labelClusters(groupList)
  } catch (err) {
    return badGateway((err as Error).message)
  }

  // Full recompute: replace this user's clustering with the fresh one.
  const { error: deleteError } = await supabase.from('clusters').delete().eq('user_id', userId)
  if (deleteError) return serverError(deleteError.message)

  const clusterRows = groupList.map((_, i) => {
    const label = labels.find((l) => l.index === i)
    return {
      user_id: userId,
      label: label?.label ?? `Cluster ${i + 1}`,
      summary: label?.summary ?? '',
    }
  })

  const { data: insertedClusters, error: insertError } = await supabase
    .from('clusters')
    .insert(clusterRows)
    .select()
  if (insertError) return serverError(insertError.message)

  const noteClusterRows = insertedClusters.flatMap((cluster, i) =>
    groupList[i].map((note) => ({ note_id: note.id, cluster_id: cluster.id })),
  )
  const { error: ncError } = await supabase.from('note_clusters').insert(noteClusterRows)
  if (ncError) return serverError(ncError.message)

  return json({ clusters: insertedClusters })
})

function parseVector(literal: string): number[] {
  return literal
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(Number)
}

function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

function euclideanSq(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return sum
}

function kmeans(vectors: number[][], k: number, iterations = 15): number[] {
  const n = vectors.length
  const dim = vectors[0].length

  const centroidIdx = new Set<number>()
  while (centroidIdx.size < k) centroidIdx.add(Math.floor(Math.random() * n))
  let centroids = [...centroidIdx].map((i) => [...vectors[i]])

  const assignments = new Array(n).fill(0)

  for (let iter = 0; iter < iterations; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < k; c++) {
        const d = euclideanSq(vectors[i], centroids[c])
        if (d < bestDist) {
          bestDist = d
          best = c
        }
      }
      if (assignments[i] !== best) changed = true
      assignments[i] = best
    }

    const sums = Array.from({ length: k }, () => new Array(dim).fill(0))
    const counts = new Array(k).fill(0)
    for (let i = 0; i < n; i++) {
      counts[assignments[i]]++
      for (let d = 0; d < dim; d++) sums[assignments[i]][d] += vectors[i][d]
    }
    centroids = sums.map((sum, c) => (counts[c] > 0 ? sum.map((s) => s / counts[c]) : centroids[c]))

    if (!changed) break
  }

  return assignments
}

async function labelClusters(groups: NoteRow[][]): Promise<LabeledCluster[]> {
  const clustersBlock = groups
    .map(
      (g, i) =>
        `Cluster ${i}:\n` +
        g
          .slice(0, 5)
          .map((n) => `- ${n.title}: ${n.content.slice(0, 150)}`)
          .join('\n'),
    )
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
          name: 'label_clusters',
          description: "Give each cluster of notes a short theme label and one-sentence summary.",
          input_schema: {
            type: 'object',
            properties: {
              clusters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    label: { type: 'string', description: '2-4 word theme name' },
                    summary: { type: 'string', description: 'One sentence describing the theme.' },
                  },
                  required: ['index', 'label', 'summary'],
                },
              },
            },
            required: ['clusters'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'label_clusters' },
      messages: [
        {
          role: 'user',
          content: `Here are groups of notes clustered by semantic similarity. Name each cluster's theme.\n\n${clustersBlock}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Anthropic request failed: ${await res.text()}`)

  const data = await res.json()
  const toolUse = data.content?.find((b: { type: string }) => b.type === 'tool_use')
  return (toolUse?.input?.clusters ?? []) as LabeledCluster[]
}
