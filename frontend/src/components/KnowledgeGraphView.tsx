import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphEdge, GraphNode } from "../types";

const TYPE_COLORS: Record<string, string> = {
  person: "#38bdf8",
  organization: "#34d399",
  location: "#fbbf24",
  concept: "#a78bfa",
  event: "#f472b6",
  product: "#60a5fa",
};

function getNodeColor(type?: string) {
  return TYPE_COLORS[(type || "").toLowerCase()] ?? "#71717a";
}

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function KnowledgeGraphView({ nodes, edges }: KnowledgeGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<GraphNode | null>(null);
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

  const graphData = useMemo(() => ({
    nodes: nodes.map(n => ({ ...n })),
    links: edges.slice(0, 40).map(e => ({ ...e })),
  }), [nodes, edges]);

  const handleNodeClick = useCallback((node: any) => {
    selectedRef.current = node as GraphNode;
    if (tooltipRef.current) {
      tooltipRef.current.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-weight:600;color:white;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${node.label || "Unknown"}</span>
          <button onclick="this.closest('.tooltip-card').style.display='none'" style="color:#71717a;background:none;border:none;cursor:pointer;font-size:16px">×</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;font-size:11px">
          <span style="color:#71717a">Type:</span>
          <span style="background:#27272a;padding:2px 8px;border-radius:4px;color:#d4d4d8;text-transform:capitalize">${node.type || "unknown"}</span>
        </div>
      `;
      tooltipRef.current.style.display = "block";
    }
  }, []);

  const handleEngineStop = useCallback(() => {
    if (graphRef.current) graphRef.current.zoomToFit(400, 40);
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
            nodeLabel=""
            nodeRelSize={5}
            linkColor={() => "#3f3f46"}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            enableNodeDrag={false}
            cooldownTicks={100}
            warmupTicks={50}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.7}
            onEngineStop={handleEngineStop}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              if (node.x == null || node.y == null) return;
              const color = getNodeColor(node.type);
              const r = 4;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = "rgba(0,0,0,0.4)";
              ctx.lineWidth = 0.5;
              ctx.stroke();
              if (globalScale > 0.8) {
                const label = (node.label || "").slice(0, 18);
                const fontSize = Math.min(4, 11 / globalScale);
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = color;
                ctx.fillText(label, node.x, node.y + r + 1);
              }
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 8, 0, 2 * Math.PI);
              ctx.fill();
            }}
          />
        )}
      </div>

      <div
        ref={tooltipRef}
        className="tooltip-card absolute bottom-4 right-4 z-10 w-56 rounded-xl border border-border bg-surface-overlay p-3 shadow-xl"
        style={{ display: "none" }}
      />
    </div>
  );
}
