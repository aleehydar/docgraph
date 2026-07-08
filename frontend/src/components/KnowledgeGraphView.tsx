import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CANVAS_W = 580;
const CANVAS_H = 360;

function getColor(type?: string) {
  return NODE_COLORS[(type || "").toLowerCase()] ?? NODE_COLORS.default;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function KnowledgeGraphView({ nodes, edges }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });

  const layout = useMemo(() => {
    if (!nodes.length) {
      return {
        positions: {} as Record<string, { x: number; y: number }>,
        edges: [] as GraphEdge[],
      };
    }
    const positions: Record<string, { x: number; y: number }> = {};
    const cx = CANVAS_W / 2;
    const cy = CANVAS_H / 2;
    const R = Math.min(cx, cy) - 55;
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positions[n.id] =
        nodes.length === 1
          ? { x: cx, y: cy }
          : { x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) };
    });
    return { positions, edges: edges.slice(0, 40) };
  }, [nodes, edges]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { positions, edges: layoutEdges } = layout;
    const { x, y, scale } = transform;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    layoutEdges.forEach((e) => {
      const src = positions[e.source];
      const tgt = positions[e.target];
      if (!src || !tgt) return;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = "#3f3f46";
      ctx.lineWidth = 1 / scale;
      ctx.stroke();

      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      const arrow = 6 / scale;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx - arrow * Math.cos(angle - 0.4), my - arrow * Math.sin(angle - 0.4));
      ctx.lineTo(mx - arrow * Math.cos(angle + 0.4), my - arrow * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fillStyle = "#52525b";
      ctx.fill();
    });

    nodes.forEach((n) => {
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

    ctx.restore();
  }, [layout, nodes, transform]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, [nodes, edges]);

  const endDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Prevent the browser's default canvas-drag behavior, which clears the bitmap.
    e.preventDefault();
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({
      ...t,
      scale: Math.min(3, Math.max(0.4, t.scale * factor)),
    }));
  }, []);

  if (!nodes.length) return null;

  return (
    <div
      className="relative h-[360px] w-full cursor-grab overflow-hidden rounded-lg border border-border bg-zinc-950/50 active:cursor-grabbing"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onWheel={onWheel}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        draggable={false}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export default memo(KnowledgeGraphView);
