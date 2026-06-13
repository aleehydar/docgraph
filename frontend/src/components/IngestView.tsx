import clsx from "clsx";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { ingestDocument } from "../lib/api";
import type { IngestResult } from "../types";
import FileDropzone from "./FileDropzone";

interface IngestViewProps {
  onNavigateQuery: () => void;
}

export default function IngestView({ onNavigateQuery }: IngestViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  async function handleIngest() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await ingestDocument(file);
      setResult({ ...data, filename: file.name, timestamp: Date.now() });
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingestion failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in mx-auto max-w-2xl space-y-8">
      <header>
        <h2 className="text-xl font-semibold tracking-tight text-white">Ingest document</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
          Upload a document to extract entities and relationships into a Neo4j knowledge graph,
          with semantic embeddings stored in FAISS.
        </p>
      </header>

      <FileDropzone file={file} onFileChange={setFile} disabled={loading} />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleIngest}
          disabled={!file || loading}
          className="btn-primary"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            <>
              Ingest document
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {loading && (
        <div className="panel animate-slide-up">
          <div className="panel-body space-y-4">
            <PipelineStep label="Extracting text" active />
            <PipelineStep label="Chunking document" active />
            <PipelineStep label="Extracting entities via LLM" pending />
            <PipelineStep label="Building knowledge graph" pending />
            <PipelineStep label="Generating embeddings" pending />
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="panel animate-slide-up overflow-hidden border-emerald-500/20">
          <div className="flex items-start gap-3 border-b border-border bg-emerald-500/5 px-5 py-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-white">{result.message}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{result.filename}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <StatCell value={result.chunks} label="Chunks" />
            <StatCell value={result.entities} label="Entities" />
            <StatCell value={result.relationships} label="Relationships" />
          </div>
          <div className="border-t border-border px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Document ID
            </p>
            <p className="mt-1 truncate font-mono text-xs text-emerald-400">{result.doc_id}</p>
          </div>
          <div className="border-t border-border px-5 py-4">
            <button onClick={onNavigateQuery} className="btn-primary w-full">
              Query this knowledge base
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-5 py-5 text-center">
      <p className="stat-value">{value.toLocaleString()}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}

function PipelineStep({
  label,
  active,
  pending,
}: {
  label: string;
  active?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={clsx(
          "h-2 w-2 rounded-full",
          active && "animate-pulse-soft bg-emerald-400",
          pending && "bg-zinc-700",
          !active && !pending && "bg-emerald-400",
        )}
      />
      <span
        className={clsx(
          "text-sm",
          active ? "text-zinc-300" : pending ? "text-zinc-600" : "text-zinc-400",
        )}
      >
        {label}
      </span>
      {active && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-emerald-400" />}
    </div>
  );
}
