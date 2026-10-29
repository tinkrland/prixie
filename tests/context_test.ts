// the video grounding read: a real declaration (platform "video"), a
// compact prompt line, and honest silence when the head gives nothing.

import { assertEquals } from "jsr:@std/assert@1.0.19";
import { groundTurn } from "../server/context.ts";

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withFetch(
  handler: (url: string, init?: RequestInit) => Response,
  fn: () => Promise<void>,
): Promise<void> {
  return (async () => {
    const original = globalThis.fetch;
    globalThis.fetch = ((input: any, init?: RequestInit) =>
      Promise.resolve(handler(String(input), init))) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = original;
    }
  })();
}

Deno.test("groundTurn: nodes become one prompt line, platform declared video", async () => {
  Deno.env.set("MEETING_API_URL", "https://proxy.example.com");
  Deno.env.delete("RETELLDB_URL");
  let seen: any = null;
  await withFetch(
    (_url, init) => {
      seen = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResp({
        enabled: true,
        nodes: [
          { id: "1", title: "priya prefers morning calls", type: "preference", content: "" },
          { id: "2", title: "priya runs a design studio", type: "fact", content: "" },
        ],
        dropped: [{ id: "x", reason: "anchor" }],
      });
    },
    async () => {
      const g = await groundTurn({ subject: "priya", meetingId: "m1" });
      assertEquals(g.via, "proxy");
      assertEquals(g.line, "priya prefers morning calls; priya runs a design studio");
      assertEquals(g.dropped, 1);
      assertEquals(seen.platform, "video");
      assertEquals(seen.meeting_id, "m1");
    },
  );
  Deno.env.delete("MEETING_API_URL");
});

Deno.test("groundTurn: no head = no line, nothing invented", async () => {
  Deno.env.delete("MEETING_API_URL");
  Deno.env.delete("RETELLDB_URL");
  const g = await groundTurn({ subject: "anything" });
  assertEquals(g.via, "none");
  assertEquals(g.line, null);
  assertEquals(g.nodes.length, 0);
});
