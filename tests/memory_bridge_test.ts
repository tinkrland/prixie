// the bridge is the surface's declaration: platform always, meeting when
// it has one. these tests hold the three honest answers (proxy, direct,
// nothing) and the failure shapes: a bridge that throws is worse than a
// bridge that returns [].

import { assertEquals } from "jsr:@std/assert@1.0.19";
import { recallForCall } from "../server/memory_bridge.ts";

let captured: { url: string; body: any }[] = [];

function withFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  return (async () => {
    const original = globalThis.fetch;
    captured = [];
    const calls = captured;
    globalThis.fetch = (async (input: any, init?: RequestInit) => {
      const url = String(input);
      let body: any = null;
      try {
        body = init?.body ? JSON.parse(String(init.body)) : null;
      } catch {
        body = null;
      }
      calls.push({ url, body });
      return await handler(url, init);
    }) as typeof fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = original;
    }
  })();
}

function calls(): { url: string; body: any }[] {
  return captured;
}

function jsonResp(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("bridge: the proxy path declares the platform AND the meeting", async () => {
  Deno.env.set("MEETING_API_URL", "https://proxy.example.com");
  Deno.env.delete("RETELLDB_URL");
  await withFetch(
    () =>
      jsonResp({
        enabled: true,
        nodes: [{ id: "n1", title: "priya prefers morning calls", type: "preference", content: "..." }],
        dropped: [{ id: "x", reason: "another person's context never crosses" }],
      }),
    async () => {
      const res = await recallForCall({ query: "when does priya meet", meetingId: "m1" });
      assertEquals(res.via, "proxy");
      assertEquals(res.nodes.length, 1);
      assertEquals(res.dropped, 1);
      const call = calls()[0];
      assertEquals(call.url, "https://proxy.example.com/api/memory/recall");
      assertEquals(call.body.platform, "voice");
      assertEquals(call.body.meeting_id, "m1");
    },
  );
  Deno.env.delete("MEETING_API_URL");
});

Deno.test("bridge: proxy disabled falls back to direct retelldb WITH platform", async () => {
  Deno.env.set("MEETING_API_URL", "https://proxy.example.com");
  Deno.env.set("RETELLDB_URL", "http://retell.local:8000");
  await withFetch(
    (url) => {
      if (url.includes("/api/memory/recall")) return jsonResp({ enabled: false, reason: "head unset" });
      return jsonResp({ success: true, result: { nodes: [{ node: { id: "n2", title: "shared fact", type: "fact", content: "" }, score: 0.9 }], dropped: [] } });
    },
    async () => {
      const res = await recallForCall({ query: "what do we know" });
      assertEquals(res.via, "retelldb");
      assertEquals(res.nodes[0].title, "shared fact");
      const last = calls()[calls().length - 1];
      assertEquals(last.body.platform, "voice");
    },
  );
  Deno.env.delete("MEETING_API_URL");
  Deno.env.delete("RETELLDB_URL");
});

Deno.test("bridge: nothing configured, nothing invented", async () => {
  Deno.env.delete("MEETING_API_URL");
  Deno.env.delete("RETELLDB_URL");
  const res = await recallForCall({ query: "anything" });
  assertEquals(res.via, "none");
  assertEquals(res.nodes.length, 0);
});

Deno.test("bridge: empty query never calls the head", async () => {
  Deno.env.set("MEETING_API_URL", "https://proxy.example.com");
  await withFetch(() => jsonResp({ enabled: true, nodes: [] }), async () => {
    const res = await recallForCall({ query: "   " });
    assertEquals(res.via, "none");
    assertEquals(calls().length, 0);
  });
  Deno.env.delete("MEETING_API_URL");
});
