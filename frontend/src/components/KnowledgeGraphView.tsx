import { useEffect, useRef, useMemo } from "react";
import type { GraphEdge, GraphNode } from "../types";

const NODE_COLORS: Record<string, string> = {
  person: "#38bdf8",
  organization: "#34d399",
  location: "#fbbf24",
  concept: "#a78bfa",
  event: "#f472b6",
  product: "#60a5fa",
  default: "#71717a",
};

function getColor(type?: string) {
  return NODE_COLORS[(type || "").toLowerCase()] ?? NODE_COLORS.default;
}

interface Props { nodes: GraphNode[]; edges: GraphEdge[]; }

export default function KnowledgeGraphView({ nodes, edges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const layout = useMemo(() => {
    if (!nodes.length) return { positions: {} as Record<string, {x:number,y:number}>, edges: [] as GraphEdge[] };
    const positions: Record<string, { x: number; y: number }> = {};
    const W = 580, H = 360, cx = W / 2, cy = H / 2;
    const R = Math.min(cx, cy) - 55;
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positions[n.id] = nodes.length === 1
        ? { x: cx, y: cy }
        : { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    });
    return { positions, edges: edges.slice(0, 40) };
  }, [nodes, edges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { positions, edges: layoutEdges } = layout;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw edges
    layoutEdges.forEach(e => {
      const src = positions[e.source];
      const tgt = positions[e.target];
      if (!src || !tgt) return;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1;
      ctx.stroke();
      // Arrowhead at midpoint
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - 6 * Math.cos(angle - 0.4), my - 6 * Math.sin(angle - 0.4));
      ctx.lineTo(mx - 6 * Math.cos(angle + 0.4), my - 6 * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = "#52525b";
      ctx.fill();
    });

    // Draw nodes
    nodes.forEach(n => {
      const pos = positions[n.id];
      if (!pos) return;
      const color = getColor(n.type);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 8, 0, 2 * Math.PI);
      ctx.fillStyle = color + "33";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      const label = (n.label || n.id).slice(0, 22);
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(9,9,11,0.85)";
      ctx.fillRect(pos.x - tw / 2 - 2, pos.y + 9, tw + 4, 13);
      ctx.fillStyle = color;
      ctx.fillText(label, pos.x, pos.y + 10);
    });
  }, [layout, nodes]);

  if (!nodes.length) return null;

  return (
    <canvas
      ref={canvasRef}
      width={580}
      height={360}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "8px",
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}
