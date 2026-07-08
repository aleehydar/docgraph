import { memo, useEffect, useMemo, useRef } from "react";
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

const VIEW_W = 580;
const VIEW_H = 360;

function getColor(type?: string) {
  return NODE_COLORS[(type || "").toLowerCase()] ?? NODE_COLORS.default;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function KnowledgeGraphView({ nodes, edges }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  const transform = useRef({ x: 0, y: 0, scale: 1 });

  const layout = useMemo(() => {
    if (!nodes.length) {
      return {
        positions: {} as Record<string, { x: number; y: number }>,
        edges: [] as GraphEdge[],
      };
    }
    const positions: Record<string, { x: number; y: number }> = {};
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
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

  const applyTransform = () => {
    const g = gRef.current;
    if (!g) return;
    const { x, y, scale } = transform.current;
    g.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
  };

  useEffect(() => {
    transform.current = { x: 0, y: 0, scale: 1 };
    applyTransform();
  }, [nodes, edges]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      container.setPointerCapture(e.pointerId);
      container.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      transform.current.x += dx;
      transform.current.y += dy;
      applyTransform();
    };

    const endDrag = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      container.style.cursor = "grab";
      if (container.hasPointerCapture(e.pointerId)) {
        container.releasePointerCapture(e.pointerId);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      transform.current.scale = Math.min(3, Math.max(0.4, transform.current.scale * factor));
      applyTransform();
    };

    const blockDrag = (e: Event) => {
      e.preventDefault();
    };

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);
    container.addEventListener("lostpointercapture", endDrag);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("dragstart", blockDrag);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      container.removeEventListener("lostpointercapture", endDrag);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("dragstart", blockDrag);
    };
  }, []);

  if (!nodes.length) return null;

  const { positions, edges: layoutEdges } = layout;

  return (
    <div
      ref={containerRef}
      className="relative h-[360px] w-full select-none overflow-hidden rounded-lg border border-border bg-zinc-950/50"
      style={{ touchAction: "none", cursor: "grab" }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        className="block"
        role="img"
        aria-label="Knowledge subgraph"
      >
        <g ref={gRef}>
          {layoutEdges.map((e, i) => {
            const src = positions[e.source];
            const tgt = positions[e.target];
            if (!src || !tgt) return null;
            const mx = (src.x + tgt.x) / 2;
            const my = (src.y + tgt.y) / 2;
            const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
            const ax = mx - 6 * Math.cos(angle - 0.4);
            const ay = my - 6 * Math.sin(angle - 0.4);
            const bx = mx - 6 * Math.cos(angle + 0.4);
            const by = my - 6 * Math.sin(angle + 0.4);
            return (
              <g key={`${e.source}-${e.target}-${i}`}>
                <line
                  x1={src.x}
                  y1={src.y}
                  x2={tgt.x}
                  y2={tgt.y}
                  stroke="#3f3f46"
                  strokeWidth={1}
                />
                <polygon points={`${mx},${my} ${ax},${ay} ${bx},${by}`} fill="#52525b" />
              </g>
            );
          })}

          {nodes.map((n) => {
            const pos = positions[n.id];
            if (!pos) return null;
            const color = getColor(n.type);
            const label = (n.label || n.id).slice(0, 22);
            const labelW = label.length * 5.8 + 8;
            return (
              <g key={n.id}>
                <circle cx={pos.x} cy={pos.y} r={8} fill={`${color}33`} />
                <circle cx={pos.x} cy={pos.y} r={5} fill={color} />
                <rect
                  x={pos.x - labelW / 2}
                  y={pos.y + 9}
                  width={labelW}
                  height={13}
                  rx={2}
                  fill="rgba(9,9,11,0.85)"
                />
                <text
                  x={pos.x}
                  y={pos.y + 19}
                  textAnchor="middle"
                  fill={color}
                  fontSize={10}
                  fontFamily="sans-serif"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export default memo(KnowledgeGraphView);
