// the video surface's memory read (anne, oct 29 2026).
//
// handoff.ts has always said "retelldb decides what the voice is: what she
// knows (memory query)" - this file is the query it meant. until now the
// video branch carried retelldb/ from sync-context but nothing in its
// server read or wrote it, so the claim was documentation, not behavior.
//
// the split that matters: GROUNDING is this file (what she knows before a
// turn), DELIVERY is persona/voice_adapter.ts (how she sounds). the turn
// pipeline (turn.ts) is pure stages and stays that way: grounding happens
// where the text for a turn is built, not inside the renderer.
//
// platform "video" is declared on every path. the meeting id, when the
// caller has one, lets the proxy resolve the anchor itself (the surface
// never carries a copy of who anybody is).

import { recallForCall, type BridgedNode, type BridgedRecall } from "./memory_bridge.ts";

export interface TurnGrounding {
  // what the head returned for this turn's subject: persona + shared
  // memory, plus the counterpart's anchored memory when the proxy could
  // anchor the meeting
  nodes: BridgedNode[];
  via: BridgedRecall["via"];
  dropped: number;
  // a compact line for the turn's prompt, or null when the head gave
  // nothing: an on-camera turn with no grounding says nothing invented
  line: string | null;
}

export async function groundTurn(opts: {
  subject: string;
  personaId?: string;
  meetingId?: string;
  topK?: number;
}): Promise<TurnGrounding> {
  const res = await recallForCall({
    query: opts.subject,
    personaId: opts.personaId,
    meetingId: opts.meetingId,
    topK: opts.topK ?? 4,
    platform: "video",
  });
  if (!res.nodes.length) {
    return { nodes: [], via: res.via, dropped: res.dropped, line: null };
  }
  const line = res.nodes
    .slice(0, 4)
    .map((n) => n.title.trim())
    .filter(Boolean)
    .join("; ");
  return {
    nodes: res.nodes,
    via: res.via,
    dropped: res.dropped,
    line: line || null,
  };
}
