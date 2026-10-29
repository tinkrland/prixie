// the memory bridge: the voice surface declares itself and asks the head.
//
// before this file, voice queried retelldb raw: a query with no platform
// and no counterpart, which the head must treat as unanchored, so any
// memory that belongs to a specific person was (correctly) held back and
// a reconnect read as a cold start every time.
//
// the bridge fixes the declaration, not the policy. the policy lives once,
// in retelldb (routing/scope.py) and in the proxy's anchors
// (PRIXIE_CONNECTIONS). this file only says WHICH MOUTH is talking and,
// when it knows, which meeting (the proxy resolves the meeting's anchor
// itself, so a surface never carries a copy of who anybody is).
//
// two routes, in this order:
//   1. the proxy: POST {MEETING_API_URL}/api/memory/recall with
//      { query, platform, meeting_id } - anchors and policy are the
//      proxy's, and this is the only path that can carry a connection.
//   2. direct retelldb: POST {RETELLDB_URL}/v1/query with platform
//      declared. unanchored but honest: shared and persona memory still
//      answer, and the head's drop list says what it withheld.
// both down = null. a surface that cannot reach memory runs on the
// persona profile alone, never on invented facts.

export interface BridgedNode {
  id: string;
  title: string;
  type: string;
  content: string;
  score?: number;
}

export interface BridgedRecall {
  nodes: BridgedNode[];
  // which path answered: kept so a caller can log the truth, and so a
  // receipt never implies anchoring it did not have
  via: "proxy" | "retelldb" | "none";
  dropped: number;
}

function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", ...extra };
}

export async function recallForCall(opts: {
  query: string;
  meetingId?: string;
  personaId?: string;
  topK?: number;
  platform?: string;
}): Promise<BridgedRecall> {
  const query = (opts.query || "").trim();
  const platform = opts.platform || "socmed";
  if (!query) return { nodes: [], via: "none", dropped: 0 };

  // 1. the proxy path: anchors + scope policy in one place
  const proxy = Deno.env.get("MEETING_API_URL");
  if (proxy) {
    try {
      const resp = await fetch(`${proxy.replace(/\/$/, "")}/api/memory/recall`, {
        method: "POST",
        headers: jsonHeaders(
          Deno.env.get("MEETING_API_TOKEN")
            ? { authorization: `Bearer ${Deno.env.get("MEETING_API_TOKEN")}` }
            : {},
        ),
        body: JSON.stringify({
          query,
          platform,
          meeting_id: opts.meetingId ?? null,
          persona_id: opts.personaId ?? null,
          top_k: opts.topK ?? 5,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.enabled) {
          const nodes: BridgedNode[] = (data.nodes || []).map((n: any) => ({
            id: n.id ?? n.node?.id ?? "",
            title: n.title ?? n.node?.title ?? "",
            type: n.type ?? n.node?.type ?? "",
            content: n.content ?? n.node?.content ?? "",
            score: n.score,
          }));
          return { nodes, via: "proxy", dropped: (data.dropped || []).length };
        }
      }
    } catch (err: any) {
      console.warn(`prixie socmed: proxy recall failed: ${err.message}`);
    }
  }

  // 2. direct retelldb, platform declared
  const url = Deno.env.get("RETELLDB_URL");
  if (url) {
    try {
      const key = Deno.env.get("RETELLDB_API_KEY");
      const resp = await fetch(`${url.replace(/\/$/, "")}/v1/query`, {
        method: "POST",
        headers: jsonHeaders(key ? { "x-api-key": key } : {}),
        body: JSON.stringify({
          query,
          platform,
          persona_id: opts.personaId ?? null,
          top_k: opts.topK ?? 5,
          include_edges: false,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const nodes: BridgedNode[] = (data.result?.nodes ?? []).map((sn: any) => ({
          id: sn.node?.id ?? "",
          title: sn.node?.title ?? "",
          type: sn.node?.type ?? "",
          content: sn.node?.content ?? "",
          score: sn.score,
        }));
        return {
          nodes,
          via: "retelldb",
          dropped: (data.result?.dropped || []).length,
        };
      }
    } catch (err: any) {
      console.warn(`prixie socmed: retelldb recall failed: ${err.message}`);
    }
  }

  return { nodes: [], via: "none", dropped: 0 };
}
