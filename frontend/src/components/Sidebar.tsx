import { useState } from "react";
import clsx from "clsx";
import { Activity, Database, Network, Sparkles, Upload } from "lucide-react";
import type { HealthResponse, QuerySettings, View } from "../types";
import { isServiceOk, resetDatabase } from "../lib/api";

interface SidebarProps {
  view: View;
  onViewChange: (view: View) => void;
  settings: QuerySettings;
  onSettingsChange: (settings: QuerySettings) => void;
  health: HealthResponse | null;
  healthLoading: boolean;
  onRefreshHealth: () => void;
}

const NAV: { id: View; label: string; icon: typeof Upload }[] = [
  { id: "ingest", label: "Ingest", icon: Upload },
  { id: "query", label: "Query", icon: Sparkles },
];

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={clsx(
        "inline-block h-1.5 w-1.5 rounded-full",
        ok ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-red-400",
      )}
    />
  );
}

export default function Sidebar({
  view,
  onViewChange,
  settings,
  onSettingsChange,
  health,
  healthLoading,
  onRefreshHealth,
}: SidebarProps) {
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to clear all data? This will permanently delete your Neo4j graph and FAISS vectors.")) return;
    setResetting(true);
    try {
      await resetDatabase();
      onRefreshHealth();
      alert("Database successfully reset!");
    } catch (e) {
      alert("Reset failed: " + (e instanceof Error ? e.message : e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
            <Network className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-white">DocGraph</h1>
            <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-500">
              GraphRAG
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          Workspace
        </p>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onViewChange(id)}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              view === id
                ? "bg-surface-overlay text-white"
                : "text-zinc-400 hover:bg-surface-overlay/50 hover:text-zinc-200",
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={view === id ? 2.25 : 2} />
            {label}
          </button>
        ))}

        {/* Settings — only relevant on query view but always visible */}
        <div className="mt-6">
          <p className="mb-3 px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Retrieval
          </p>
          <div className="space-y-4 rounded-lg border border-border bg-surface-raised px-3 py-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400">Top-K chunks</label>
                <span className="font-mono text-xs text-emerald-400">{settings.topK}</span>
              </div>
              <input
                type="range"
                min={1}
                max={20}
                value={settings.topK}
                onChange={(e) =>
                  onSettingsChange({ ...settings, topK: Number(e.target.value) })
                }
                className="h-1 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-emerald-500"
              />
            </div>

            <Toggle
              label="Graph traversal"
              description="Multi-hop Neo4j"
              checked={settings.useGraph}
              onChange={(v) => onSettingsChange({ ...settings, useGraph: v })}
            />
            <Toggle
              label="Vector search"
              description="FAISS semantic"
              checked={settings.useVector}
              onChange={(v) => onSettingsChange({ ...settings, useVector: v })}
            />
          </div>
        </div>
      </nav>

      {/* System status */}
      <div className="border-t border-border px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            System
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleReset}
              disabled={resetting}
              className="text-[11px] font-medium text-red-500/80 transition-colors hover:text-red-400 disabled:opacity-50"
              title="Clear Database"
            >
              {resetting ? "Resetting…" : "Reset Data"}
            </button>
            <button
              onClick={onRefreshHealth}
              disabled={healthLoading}
              className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
            >
              {healthLoading ? "Checking…" : "Refresh"}
            </button>
          </div>
        </div>

        {!health ? (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <StatusDot ok={false} />
            <span className="text-xs text-red-400">API unreachable</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <ServiceRow
              icon={Database}
              label="Neo4j"
              value={health.neo4j}
              ok={isServiceOk(health.neo4j)}
            />
            <ServiceRow
              icon={Activity}
              label="FAISS"
              value={health.faiss}
              ok={isServiceOk(health.faiss)}
            />
            <ServiceRow
              icon={Sparkles}
              label="LLM"
              value={health.llm}
              ok={true}
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-300">{label}</p>
        <p className="text-[11px] text-zinc-600">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-emerald-600" : "bg-zinc-700",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

function ServiceRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
      <StatusDot ok={ok} />
      <Icon className="h-3 w-3 text-zinc-600" />
      <span className="text-[11px] font-medium text-zinc-500">{label}</span>
      <span className="ml-auto truncate font-mono text-[10px] text-zinc-600" title={value}>
        {value.length > 18 ? value.slice(0, 18) + "…" : value}
      </span>
    </div>
  );
}
