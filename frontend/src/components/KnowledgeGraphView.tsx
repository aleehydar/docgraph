import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphEdge, GraphNode } from "../types";

const TYPE_STYLES: Record<string, { bg: string; text: string; ring: string }> = {
  person: { bg: "bg-sky-500/10", text: "text-sky-400", ring: "ring-sky-500/20" },
  organization: { bg: "bg-emerald-500/10", text: "text-emerald-400", ring: "ring-emerald-500/20" },
  location: { bg: "bg-amber-500/10", text: "text-amber-400", ring: "ring-amber-500/20" },
  concept: { bg: "bg-violet-500/10", text: "text-violet-400", ring: "ring-violet-500/20" },
  event: { bg: "bg-pink-500/10", text: "text-pink-400", ring: "ring-pink-500/20" },
  product: { bg: "bg-blue-500/10", text: "text-blue-400", ring: "ring-blue-500/20" },
  default: { bg: "bg-zinc-500/10", text: "text-zinc-400", ring: "ring-zinc-500/20" },
};

function getNodeColor(type?: string) {
  if (!type) return "#71717a";
  const style = TYPE_STYLES[type.toLowerCase()] ?? TYPE_STYLES.default;
  if (style.text.includes("sky")) return "#38bdf8";
  if (style.text.includes("emerald")) return "#34d399";
  if (style.text.includes("amber")) return "#fbbf24";
  if (style.text.includes("violet")) return "#a78bfa";
  if (style.text.includes("pink")) return "#f472b6";
  if (style.text.includes("blue")) return "#60a5fa";
  return "#71717a";
}

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function KnowledgeGraphView({ nodes, edges }: KnowledgeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode(node as GraphNode);
  }, []);

  const graphData = useMemo(() => {
    const limitedEdges = edges.slice(0, 40);
    return {
      nodes: nodes.map(n => ({ ...n })),
      links: limitedEdges.map(e => ({ ...e })),
    };
  }, [nodes, edges]);

  const handleEngineStop = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 40);
    }
  }, []);

  return (
    <div className="relative flex h-[400px] w-full flex-col">
      <div ref={containerRef} className="flex-1 overflow-hidden rounded-lg bg-zinc-950/50 border border-border">
        {dimensions.width > 0 && dimensions.height > 0 && (
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            nodeId="id"
            nodeLabel="label"
            nodeColor={(node: any) => getNodeColor(node.type)}
            nodeRelSize={5}
            linkColor={() => "#52525b"}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            enableNodeDrag={false}
            cooldownTicks={80}
            warmupTicks={30}
            d3AlphaDecay={0.04}
            d3VelocityDecay={0.6}
            onEngineStop={handleEngineStop}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              if (!node.x || !node.y) return;
              const label = (node.label || "Unknown").slice(0, 20);
              const fontSize = Math.max(8, 11 / globalScale);
              ctx.font = `${fontSize}px Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const pad = fontSize * 0.3;
              const bw = textWidth + pad * 2;
              const bh = fontSize + pad * 2;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI);
              ctx.fillStyle = getNodeColor(node.type);
              ctx.fill();
              ctx.fillStyle = "rgba(9,9,11,0.85)";
              ctx.fillRect(node.x - bw / 2, node.y + 5, bw, bh);
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = getNodeColor(node.type);
              ctx.fillText(label, node.x, node.y + 5 + pad);
              node.__bckgDimensions = [bw, bh];
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkCanvasObjectMode={() => "after"}
            linkCanvasObject={(link: any, ctx, globalScale) => {
              if (globalScale < 1.5) return;
              const start = link.source;
              const end = link.target;
              if (typeof start !== "object" || typeof end !== "object") return;
              if (!start.x || !end.x) return;
              const textPos = {
                x: start.x + (end.x - start.x) / 2,
                y: start.y + (end.y - start.y) / 2,
              };
              const relLink = { x: end.x - start.x, y: end.y - start.y };
              let textAngle = Math.atan2(relLink.y, relLink.x);
              if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
              if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);
              const label = (link.type || "").slice(0, 15);
              ctx.font = "4px Sans-Serif";
              ctx.save();
              ctx.translate(textPos.x, textPos.y);
              ctx.rotate(textAngle);
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#71717a";
              ctx.fillText(label, 0, 0);
              ctx.restore();
            }}
          />
        )}
      </div>
      {selectedNode && (
        <div className="absolute bottom-4 right-4 z-10 w-64 rounded-xl border border-border bg-surface-overlay p-4 shadow-xl animate-in slide-in-from-bottom-2">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-semibold text-white truncate pr-2">{selectedNode.label}</h4>
            <button onClick={() => setSelectedNode(null)} className="text-zinc-500 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">Entity Type:</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 font-medium text-zinc-300 capitalize">
              {selectedNode.type}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
