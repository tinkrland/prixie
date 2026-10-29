// recall: the read side, consumed (anne, oct 29 2026).
//
// main had only the write (inbound mail anchors). this is the query
// consumer: a scoped recall the surfaces call, plus the one place main
// itself reads memory into something the owner sees: the capture-match
// receipt email gains a "who this is" line, anchored or honest-stranger.
//
// the line is built from the anchors alone (no network): a receipt must
// never wait on the head. the full scoped recall is the route's job.

import { queryMemory } from "./retelldb.ts";
import { meetingIdentity, type MeetingIdentity } from "./meeting_identity.ts";
import type { MemoryResult } from "./retelldb.ts";
import type { Connection } from "./connections.ts";

export interface RecallRequest {
  query: string;
  platform: string;
  connection_id?: string | null;
  persona_id?: string | null;
  top_k?: number;
}

// the route's core: one scoped query. null = the head is unset or
// unreachable; the caller reports that honestly instead of inventing
// an answer.
export async function recall(
  req: RecallRequest,
  connections?: Connection[],
): Promise<MemoryResult | null> {
  const platform = (req.platform || "").trim().toLowerCase();
  if (!platform) return null;
  return await queryMemory(
    req.query,
    {
      persona_id: req.persona_id ?? undefined,
      platform,
      connection_id: req.connection_id ?? null,
    },
    { topK: req.top_k },
  );
}

// the receipt line. three honest states, no fourth:
//   anchored  -> "who: <label>"
//   stranger  -> "who: someone you have no anchor for"
//   ambiguous -> "who: an anchor held by more than one connection"
// no anchor config at all says nothing: nagging a deploy that never
// wanted anchors helps nobody.
export function hostReceiptLine(
  meeting: { platform?: string | null; zoom_user_email?: string | null; host_name?: string | null },
  connections?: Connection[],
): string | null {
  const identity: MeetingIdentity = meetingIdentity(meeting, connections);
  if (identity.host_connection) {
    const label = identity.host_connection.label;
    const via = identity.resolved_via === "email" ? " (known through mail)" : "";
    return `who: ${label}${via}`;
  }
  if (identity.scope.anchor === "ambiguous") {
    return "who: an anchor held by more than one connection, so nobody was assumed";
  }
  if (identity.scope.anchor === "stranger" && identity.host_email) {
    return "who: someone you have no anchor for yet";
  }
  return null;
}
