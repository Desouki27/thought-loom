import { useMemo, useRef } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from 'react-force-graph-2d'
import type { Cluster, Note, NoteCluster, NoteLink } from '../../lib/types'

interface GraphNode extends NodeObject {
  id: string
  title: string
  clusterColor: string | null
}

interface GraphLink {
  source: string
  target: string
  kind: NoteLink['kind']
}

const CLUSTER_PALETTE = [
  '#a78bfa',
  '#f472b6',
  '#38bdf8',
  '#4ade80',
  '#fbbf24',
  '#fb7185',
  '#22d3ee',
  '#c084fc',
]

interface LoomGraphProps {
  notes: Note[]
  links: NoteLink[]
  clusters: Cluster[]
  noteClusters: NoteCluster[]
  onSelectNote: (noteId: string) => void
  selectedNoteId: string | null
}

export function LoomGraph({
  notes,
  links,
  clusters,
  noteClusters,
  onSelectNote,
  selectedNoteId,
}: LoomGraphProps) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined)

  const clusterColorByClusterId = useMemo(() => {
    const map = new Map<string, string>()
    clusters.forEach((cluster, i) => {
      map.set(cluster.id, CLUSTER_PALETTE[i % CLUSTER_PALETTE.length])
    })
    return map
  }, [clusters])

  const clusterIdByNoteId = useMemo(() => {
    const map = new Map<string, string>()
    noteClusters.forEach((nc) => map.set(nc.note_id, nc.cluster_id))
    return map
  }, [noteClusters])

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = notes.map((note) => {
      const clusterId = clusterIdByNoteId.get(note.id)
      return {
        id: note.id,
        title: note.title || 'Untitled',
        clusterColor: clusterId ? (clusterColorByClusterId.get(clusterId) ?? null) : null,
      }
    })

    const noteIds = new Set(notes.map((n) => n.id))
    const graphLinks: GraphLink[] = links
      .filter(
        (l) =>
          (l.status === 'accepted' || l.kind === 'manual') &&
          noteIds.has(l.source_note_id) &&
          noteIds.has(l.target_note_id),
      )
      .map((l) => ({ source: l.source_note_id, target: l.target_note_id, kind: l.kind }))

    return { nodes, links: graphLinks }
  }, [notes, links, clusterIdByNoteId, clusterColorByClusterId])

  if (notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-white/40">
        <p className="max-w-xs text-sm">
          Your loom is empty. Create a note to start weaving your knowledge graph.
        </p>
      </div>
    )
  }

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={graphData}
      backgroundColor="#0b0c10"
      nodeRelSize={5}
      linkColor={(link) => ((link as GraphLink).kind === 'ai_suggested' ? '#a78bfa88' : '#ffffff33')}
      linkWidth={1.2}
      linkDirectionalParticles={0}
      onNodeClick={(node) => onSelectNote((node as GraphNode).id)}
      nodeCanvasObject={(node, ctx, globalScale) => {
        const n = node as GraphNode
        const isSelected = n.id === selectedNoteId
        const radius = isSelected ? 7 : 5
        ctx.beginPath()
        ctx.arc(n.x ?? 0, n.y ?? 0, radius, 0, 2 * Math.PI)
        ctx.fillStyle = n.clusterColor ?? '#8b8ea0'
        ctx.fill()
        if (isSelected) {
          ctx.lineWidth = 2
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
        }

        const label = n.title
        const fontSize = 11 / globalScale
        ctx.font = `${fontSize}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.fillText(label, n.x ?? 0, (n.y ?? 0) + radius + 2)
      }}
    />
  )
}
