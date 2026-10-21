// mem0 memory service. conversational memory for the voice loop: what was asked,
// what was answered, so prixie never repeats herself mid-call.
// mem0 is open source: github.com/mem0ai/mem0. this uses the oss js sdk
// (mem0ai/oss): additive add() with infer on, search() before speaking.
//
// scope: yap owns only conversational recall. the conversationId IS the mem0
// userId (callers pass `prixie-meeting-${meetingId}`). cross-call persona
// memory belongs to memorium on main, so the two never fight.

import { Memory } from "npm:mem0ai/oss";

const memory = new Memory();

export interface ConversationMoment {
  role: "user" | "assistant";
  content: string;
}

// add a moment to memory (question asked, answer heard, side comment).
// additive: never overwrites, never deletes. infer is on by default so mem0
// extracts the facts itself and resolves pronouns against earlier turns.
export async function remember(
  conversationId: string,
  moment: ConversationMoment,
): Promise<void> {
  await memory.add([moment], { userId: conversationId });
}

// recall what already happened in this conversation: an empty result means
// the question has not come up yet, a hit means she should not ask it again.
export async function recall(conversationId: string, query: string): Promise<string[]> {
  const results = await memory.search(query, { userId: conversationId, limit: 5 });
  if (!Array.isArray(results)) return [];
  return results.map((r: any) => typeof r === "string" ? r : (r.memory ?? JSON.stringify(r)));
}
