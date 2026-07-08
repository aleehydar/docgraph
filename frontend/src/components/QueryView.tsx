import clsx from "clsx";
import { ArrowUp, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { streamQuery } from "../lib/api";
import type { QueryMeta, QuerySettings } from "../types";
import GraphPanel from "./GraphPanel";

const EXAMPLES: { label: string; query: string }[] = [
  {
    label: "Main topics",
    query: "What are the main topics covered in the documents?",
  },
  {
    label: "Key entities",
    query: "Who are the key people or organizations mentioned?",
  },
  {
    label: "Relationships",
    query: "Summarize the most important relationships found in the graph.",
  },
];

type Phase = "idle" | "retrieving" | "generating" | "done" | "error";

interface QueryViewProps {
  settings: QuerySettings;
}

export default function QueryView({ settings }: QueryViewProps) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState<QueryMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = useCallback(async () => {
    const q = query.trim();
    if (!q || phase === "retrieving" || phase === "generating") return;

    setPhase("retrieving");
    setAnswer("");
    setMeta(null);
    setError(null);

    try {
      for await (const event of streamQuery(q, settings)) {
        if (event.type === "meta") {
          setMeta(event);
          setPhase("generating");
        } else if (event.type === "token") {
          setAnswer((prev) => prev + event.content);
        } else if (event.type === "error") {
          setError(event.message);
          setPhase("error");
          return;
        } else if (event.type === "done") {
          setPhase("done");
        }
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
      setPhase("error");
    }
  }, [query, settings, phase]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runQuery();
    }
  };

  const isLoading = phase === "retrieving" || phase === "generating";
  const showContext = meta && (phase === "generating" || phase === "done");

  const graphStats = useMemo(
    () =>
      meta
        ? {
            graphNodes: meta.graph_nodes,
            graphEdges: meta.graph_edges,
            vectorChunks: meta.vector_chunks,
            graphHops: meta.graph_hops ?? 0,
          }
        : null,
    [meta],
  );

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <header className="mb-6 shrink-0">
        <h2 className="text-xl font-semibold tracking-tight text-white">Query knowledge graph</h2>
        <p className="mt-1.5 text-sm text-zinc-500">
          Ask natural language questions — answers combine multi-hop graph traversal with vector
          retrieval.
        </p>
      </header>

      {/* Input area */}
      <div className="panel mb-4 shrink-0 overflow-hidden">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your ingested documents…"
            rows={3}
            disabled={isLoading}
            className="w-full resize-none bg-transparent px-5 py-4 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map(({ label, query: q }) => (
                <button
                  key={label}
                  onClick={() => setQuery(q)}
                  disabled={isLoading}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] text-zinc-600 sm:block">⌘ + Enter</span>
              <button
                onClick={runQuery}
                disabled={!query.trim() || isLoading}
                className="btn-primary !py-2 !px-3"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      {phase !== "idle" && (
        <div
          className={clsx(
            "mb-4 flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs transition-colors",
            phase === "error"
              ? "border-red-500/20 bg-red-500/5 text-red-400"
              : phase === "done"
                ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                : "border-border bg-surface-raised text-zinc-400",
          )}
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {phase === "retrieving" && "Traversing knowledge graph and retrieving chunks…"}
          {phase === "generating" &&
            meta &&
            `Retrieved ${meta.graph_nodes} nodes, ${meta.graph_edges} edges, ${meta.vector_chunks} chunks — generating answer…`}
          {phase === "done" && "Answer complete"}
          {phase === "error" && (error ?? "Something went wrong")}
        </div>
      )}

      {/* Results split view */}
      {(answer || showContext) && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
          {/* Answer */}
          <div className="panel flex flex-col lg:col-span-3">
            <div className="panel-header">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Answer
              </p>
            </div>
            <div className="panel-body flex-1 overflow-y-auto">
              {answer ? (
                <div className="prose-answer">
                  <ReactMarkdown>{answer}</ReactMarkdown>
                  {phase === "generating" && (
                    <span className="ml-0.5 inline-block h-[1.1em] w-0.5 animate-pulse-soft bg-emerald-400 align-text-bottom" />
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Waiting for response…
                </div>
              )}
            </div>
            {meta && (
              <div className="border-t border-border px-5 py-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Confidence</span>
                  <span className="font-mono text-emerald-400">
                    {Math.round((meta.confidence ?? 0) * 100)}%
                  </span>
                </div>
                {(meta.citations?.length ?? 0) > 0 && (
                  <div className="mt-3 space-y-2">
                    {meta.citations?.slice(0, 3).map((c) => (
                      <div key={`${c.source}-${c.score}`} className="rounded-md bg-surface px-3 py-2">
                        <p className="truncate font-mono text-[10px] text-zinc-400">{c.source}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{c.excerpt}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Graph context */}
          <div className="panel flex flex-col overflow-hidden lg:col-span-2">
            <div className="panel-header">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                Retrieved context
              </p>
            </div>
            {meta && graphStats ? (
              <GraphPanel
                nodes={meta.nodes ?? []}
                edges={meta.edges ?? []}
                stats={graphStats}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-xs text-zinc-600">
                Context will appear after retrieval
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {phase === "idle" && !answer && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-raised">
            <svg
              className="h-7 w-7 text-zinc-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-400">Ready to query</p>
          <p className="mt-1 max-w-sm text-xs text-zinc-600">
            Ingest a document first, then ask questions about its entities, relationships, and
            content.
          </p>
        </div>
      )}
    </div>
  );
}
