import type { HealthResponse, IngestResponse, QuerySettings, StreamEvent } from "../types";

export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

function withAuthHeaders(headers: HeadersInit = {}): HeadersInit {
  return headers;
}

async function handleResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = await resp.text();
    }
    throw new Error(detail);
  }
  return resp.json() as Promise<T>;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const resp = await fetch(`${API_BASE}/health`, { headers: withAuthHeaders() });
  return handleResponse<HealthResponse>(resp);
}

export async function ingestDocument(file: File): Promise<IngestResponse> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${API_BASE}/ingest/`, {
    method: "POST",
    headers: withAuthHeaders(),
    body: form,
  });
  return handleResponse<IngestResponse>(resp);
}

export async function* streamQuery(
  query: string,
  settings: QuerySettings,
): AsyncGenerator<StreamEvent> {
  const resp = await fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: withAuthHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      query,
      top_k: settings.topK,
      use_graph: settings.useGraph,
      use_vector: settings.useVector,
      stream: true,
    }),
  });

  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        yield JSON.parse(line.slice(6)) as StreamEvent;
      }
    }
  }
}

export function isServiceOk(status: string): boolean {
  return status.toLowerCase().startsWith("ok");
}

export async function resetDatabase(): Promise<{ message: string }> {
  const resp = await fetch(`${API_BASE}/ingest/reset`, {
    method: "POST",
    headers: withAuthHeaders(),
  });
  return handleResponse<{ message: string }>(resp);
}
