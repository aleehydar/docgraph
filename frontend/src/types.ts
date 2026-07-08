export interface HealthResponse {
  status: string;
  neo4j: string;
  faiss: string;
  llm: string;
}

export interface IngestResponse {
  doc_id: string;
  chunks: number;
  entities: number;
  relationships: number;
  message: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface QueryMeta {
  type: "meta";
  graph_nodes: number;
  graph_edges: number;
  vector_chunks: number;
  graph_hops: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  confidence?: number;
  citations?: Array<{
    source: string;
    excerpt: string;
    score: number;
  }>;
}

export interface QueryToken {
  type: "token";
  content: string;
}

export interface QueryDone {
  type: "done";
}

export interface QueryError {
  type: "error";
  message: string;
}

export type StreamEvent = QueryMeta | QueryToken | QueryDone | QueryError;

export interface QuerySettings {
  topK: number;
  useGraph: boolean;
  useVector: boolean;
}

export interface IngestResult extends IngestResponse {
  filename: string;
  timestamp: number;
}

export type View = "ingest" | "query";
