import clsx from "clsx";
import type { GraphEdge, GraphNode } from "../types";
import KnowledgeGraphView from "./KnowledgeGraphView";

const TYPE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  person: { bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/20" },
  organization: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  location: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20" },
  concept: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20" },
  event: { bg: "bg-pink-500/10", text: "text-pink-400", ring: "ring-pink-500/20" },
  product: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
  default: { bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20" },
};

interface GraphPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    graphNodes: number;
    graphEdges: number;
    vectorChunks: number;
    graphHops: number;
  };
}

export default function GraphPanel({ nodes, edges, stats }: GraphPanelProps) {
  const hasGraph = nodes.length > 0 || edges.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 border-b border-border p-4">
        <MiniStat label="Nodes" value={stats.graphNodes} />
        <MiniStat label="Edges" value={stats.graphEdges} />
        <MiniStat label="Chunks" value={stats.vectorChunks} />
        <MiniStat label="Hops" value={stats.graphHops} />
      </div>

      {!hasGraph ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-overlay">
            <svg className="h-6 w-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="6" cy="12" r="2.5" strokeWidth="1.5" />
              <circle cx="18" cy="6" r="2.5" strokeWidth="1.5" />
              <circle cx="18" cy="18" r="2.5" strokeWidth="1.5" />
              <path strokeWidth="1.5" d="M8.3 11.2L15.7 7M8.3 12.8l7.4 4.2" />
            </svg>
          </div>
          <p className="text-sm text-zinc-500">No graph context retrieved</p>
          <p className="mt-1 text-xs text-zinc-600">
            Enable graph traversal and ingest documents first
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Mini graph viz */}
          {nodes.length > 0 && (
            <div className="border-b border-border p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Subgraph
              </p>
              <KnowledgeGraphView nodes={nodes} edges={edges} />
            </div>
          )}

          {/* Entity list */}
          {nodes.length > 0 && (
            <div className="border-b border-border p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Entities
              </p>
              <div className="flex flex-wrap gap-1.5">
                {nodes.map((n) => (
                  <EntityChip key={n.id} node={n} />
                ))}
              </div>
            </div>
          )}

          {/* Relationships */}
          {edges.length > 0 && (
            <div className="p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Relationships
              </p>
              <div className="space-y-2">
                {edges.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-zinc-300">{e.source}</span>
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                      {e.type}
                    </span>
                    <span className="font-medium text-zinc-300">{e.target}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntityChip({ node }: { node: GraphNode }) {
  const typeStr = node.type || "unknown";
  const style = TYPE_STYLES[typeStr.toLowerCase()] ?? TYPE_STYLES.default;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
        style.bg,
        style.text,
        style.ring,
      )}
    >
      {node.label || "Unknown"}
      <span className="opacity-60">{typeStr}</span>
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2.5">
      <p className="font-mono text-lg font-semibold tabular-nums text-white">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</p>
    </div>
  );
}
