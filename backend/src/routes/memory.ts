// the memory routes (anne, oct 29 2026): the head's read side over the
// api, so the surfaces (voice, video, socmed, recap) have one place to
// ask with a declared platform and an anchored connection.
//
//   POST /api/memory/recall
//     body: { query, platform, connection_id?, persona_id?, top_k? }
//     200 { enabled: true, nodes, dropped, strategy }
//     200 { enabled: false, reason } when the head is unset or down:
//     an honest "no head" is a real answer, an invented one is not.

import { Hono } from "hono";
import { recall } from "../services/memory_recall.ts";
import { meetingIdentity } from "../services/meeting_identity.ts";
import { getMeetingById } from "../services/supabase.ts";

const app = new Hono();

app.post("/recall", async (c) => {
  let body: {
    query?: string;
    platform?: string;
    connection_id?: string | null;
    persona_id?: string | null;
    meeting_id?: string | null;
    top_k?: number;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const query = (body.query || "").trim();
  const platform = (body.platform || "").trim();
  if (!query) return c.json({ error: "query is required" }, 400);
  if (!platform) {
    // a query with no declared surface is the cold-start bug we fixed:
    // refuse instead of letting it silently read as unanchored
    return c.json({ error: "platform is required: a recall must declare its surface" }, 400);
  }

  // a surface that knows its meeting but not the anchors (voice, video)
  // passes meeting_id: the connection resolves HERE, where the anchors
  // live, so a surface never needs a copy of who anybody is
  let connectionId = body.connection_id ?? null;
  if (!connectionId && body.meeting_id) {
    try {
      const meeting = await getMeetingById(body.meeting_id);
      if (meeting) connectionId = meetingIdentity(meeting).scope.connection_id;
    } catch (err: any) {
      console.warn(`prixie: recall could not resolve the meeting: ${err.message}`);
    }
  }

  const result = await recall({
    query,
    platform,
    connection_id: connectionId,
    persona_id: body.persona_id ?? null,
    top_k: typeof body.top_k === "number" ? body.top_k : undefined,
  });
  if (!result) {
    return c.json({
      enabled: false,
      reason: "the head is unset or unreachable (PRIXIE_RETELLDB_URL)",
    });
  }
  return c.json({
    enabled: true,
    nodes: result.nodes,
    dropped: result.dropped,
  });
});

export default app;
