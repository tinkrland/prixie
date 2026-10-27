// the chat as a take-home artifact: persistence is a supabase round
// trip, so the structural tests cover the contract pieces that are
// pure. the io paths are honest: best effort, a failure never throws
// into the triggers that run after them.

import { assertEquals } from "jsr:@std/assert@1";
import { serializeChatLog, type StoredChatLine } from "./chat_takehome.ts";

Deno.test("chat log serialization: every line attributed, empties dropped", () => {
  const lines: StoredChatLine[] = [
    { id: "1", meeting_id: "m", speaker: "priya", message: "sharing my screen now", source: "chat", created_at: "t1" },
    { id: "2", meeting_id: "m", speaker: "prixie", message: "got it, thanks!", source: "chat_sent", created_at: "t2" },
  ];
  assertEquals(
    serializeChatLog(lines),
    "priya: sharing my screen now\nprixie: got it, thanks!",
  );
});

Deno.test("chat log serialization: blank lines never make it home", () => {
  const noisy: StoredChatLine[] = [
    { id: "1", meeting_id: "m", speaker: "priya", message: "", source: "chat", created_at: "t1" },
    { id: "2", meeting_id: "m", speaker: "prixie", message: "   ", source: "chat_sent", created_at: "t2" },
  ];
  assertEquals(serializeChatLog(noisy), "");
  assertEquals(serializeChatLog([]), "");
});

Deno.test("chat log serialization: whitespace is trimmed, order preserved", () => {
  const lines: StoredChatLine[] = [
    { id: "1", meeting_id: "m", speaker: " priya ", message: "  first  ", source: "chat", created_at: "t1" },
    { id: "2", meeting_id: "m", speaker: "prixie", message: "second", source: "chat_sent", created_at: "t2" },
  ];
  assertEquals(serializeChatLog(lines), "priya: first\nprixie: second");
});
