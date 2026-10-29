// the retelldb client: the mouth asking the head (anne, oct 29 2026).
//
// the proxy stores facts in supabase; retelldb is the persona memory
// server (context branch, /v1/query + /v1/ingest). this client carries
// the memory scope with every call so the head knows which surface is
// asking and who is in front of her.
//
// honest contract, same shape as notifyOwner: PRIXIE_RETELLDB_URL
// unset = memory calls are a no-op with a warn, never a crash. a query
// that fails returns null, and callers say so; memory is never
// fabricated to fill a hole.
//
// PRIXIE_RETELLDB_KEY is optional (the server allows unauthenticated
// local use); when set it rides as a bearer token.

import { scopePayload, type MemoryScope } from "./memory_scope.ts";

export interface MemoryNode {
  id: string;
  title: string;
  type: string;
  content: string;
  namespace: string;
  tags: string[];
}

export interface MemoryDrop {
  node_id: string;
  reason: string;
}

export interface MemoryResult {
  nodes: MemoryNode[];
  // every node the scope rules held back, with the reason. silent
  // dropping is the one thing this must never do.
  dropped: MemoryDrop[];
}

function baseUrl(): string | null {
  const url = Deno.env.get("PRIXIE_RETELLDB_URL");
  return url ? url.replace(/\/+$/, "") : null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  const key = Deno.env.get("PRIXIE_RETELLDB_KEY");
  if (key) h.authorization = `Bearer ${key}`;
  return h;
}

// ask the head. null = not configured or the head refused; the caller
// reports honestly instead of guessing.
export async function queryMemory(
  query: string,
  scope: MemoryScope,
  opts: { topK?: number } = {},
): Promise<MemoryResult | null> {
  const base = baseUrl();
  if (!base) {
    console.warn("prixie: memory query skipped, PRIXIE_RETELLDB_URL unset");
    return null;
  }
  try {
    const res = await fetch(`${base}/v1/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query,
        top_k: opts.topK ?? 5,
        ...scopePayload(scope),
      }),
    });
    if (!res.ok) {
      console.warn(`prixie: memory query failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const body = await res.json();
    const result = body?.result ?? {};
    return {
      nodes: (result.nodes ?? []).map((sn: any) => ({
        id: sn.node.id,
        title: sn.node.title,
        type: sn.node.type,
        content: sn.node.content,
        namespace: sn.node.namespace,
        tags: sn.node.tags ?? [],
      })),
      dropped: result.dropped ?? [],
    };
  } catch (err: any) {
    console.warn(`prixie: memory query errored: ${err.message}`);
    return null;
  }
}

// teach the head, with provenance. returns true when the write landed;
// false (with a warn) when retelldb is unset or refused. a failed memory
// write never takes the calling flow down.
export async function ingestMemory(
  content: string,
  scope: MemoryScope,
  opts: { title?: string; sourceUri?: string } = {},
): Promise<boolean> {
  const base = baseUrl();
  if (!base) {
    console.warn("prixie: memory ingest skipped, PRIXIE_RETELLDB_URL unset");
    return false;
  }
  try {
    const res = await fetch(`${base}/v1/ingest`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        content,
        format: "markdown",
        title: opts.title,
        source_uri: opts.sourceUri,
        ...scopePayload(scope),
      }),
    });
    if (!res.ok) {
      console.warn(`prixie: memory ingest failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`prixie: memory ingest errored: ${err.message}`);
    return false;
  }
}
