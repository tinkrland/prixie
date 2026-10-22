// theurltell tests: the chain is told with injected fakes, never the
// network. pure pieces are exercised directly.

import { assertEquals } from "jsr:@std/assert";
import {
  metaRefreshTarget,
  nextHopUrl,
  stripTrackingParams,
  theUrlTell,
} from "./mod.ts";

// a fetch fake keyed by url: each entry is [status, location, body?]
function fakeFetch(
  routes: Record<string, [number, string | null, string?]>,
): typeof fetch & { calls: { url: string; method: string }[] } {
  const calls: { url: string; method: string }[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    const route = routes[url];
    if (!route) throw new Error("no route");
    const [status, location, body] = route;
    return new Response(body ?? null, {
      status,
      headers: {
        ...(location ? { location } : {}),
        ...(body ? { "content-type": "text/html" } : {}),
      },
    });
  }) as typeof fetch & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

Deno.test("stripTrackingParams removes the marketing, keeps the routing", () => {
  const r = stripTrackingParams(
    "https://docs.google.com/forms/d/abc/viewform?fbclid=Iw123&utm_source=newsletter&utm_medium=email&entry.1=x&page=2",
  );
  assertEquals(r.url, "https://docs.google.com/forms/d/abc/viewform?entry.1=x&page=2");
  assertEquals(new Set(r.removed), new Set(["fbclid", "utm_source", "utm_medium"]));
});

Deno.test("nextHopUrl resolves relative locations and ignores non-redirects", () => {
  assertEquals(nextHopUrl("https://bit.ly/abc", 301, "/jump"), "https://bit.ly/jump");
  assertEquals(nextHopUrl("https://bit.ly/abc", 200, "https://x.com"), null);
  assertEquals(nextHopUrl("https://bit.ly/abc", 302, null), null);
});

Deno.test("metaRefreshTarget is parsed, never executed", () => {
  const html = `<head><meta http-equiv="refresh" content="0; url=https://example.com/real"></head>`;
  assertEquals(metaRefreshTarget(html, "https://short.example/x"), "https://example.com/real");
  assertEquals(metaRefreshTarget("<html>plain page</html>", "https://a.example/"), null);
});

Deno.test("theUrlTell walks a shortener chain to the destination, stripping trackers added mid-chain", async () => {
  const fetch = fakeFetch({
    "https://bit.ly/join123": [301, "https://track.example/click?utm_campaign=oct&u=https%3A%2F%2Fzoom.us%2Fj%2F999"],
    "https://track.example/click?u=https%3A%2F%2Fzoom.us%2Fj%2F999": [302, "https://zoom.us/j/999?pwd=abc&utm_content=webinar"],
    "https://zoom.us/j/999?pwd=abc": [200, null],
  });
  const tell = await theUrlTell("https://bit.ly/join123?utm_source=slack", { fetchImpl: fetch });
  assertEquals(tell.verdict, "clear");
  assertEquals(tell.destination, "https://zoom.us/j/999?pwd=abc");
  assertEquals(tell.chain.length, 3);
  assertEquals(tell.chain[0].status, 301);
  // trackers from BOTH the start link and the mid-chain hop are gone,
  // and the fetch fake confirms they never got the ping
  assertEquals(new Set(tell.trackersStripped), new Set(["utm_source", "utm_campaign", "utm_content"]));
  assertEquals(fetch.calls.every((c) => !c.url.includes("utm_")), true);
});

Deno.test("theUrlTell does not follow a redirect that bends somewhere she does not go", async () => {
  const fetch = fakeFetch({
    "https://short.example/ok": [302, "javascript:alert(1)"],
  });
  const tell = await theUrlTell("https://short.example/ok", { fetchImpl: fetch });
  assertEquals(tell.verdict, "blocked");
  assertEquals(tell.destination, null);
  assertEquals(tell.reason.includes("does not go"), true);
});

Deno.test("theUrlTell calls a loop a loop", async () => {
  const fetch = fakeFetch({
    "https://a.example/one": [302, "https://b.example/two"],
    "https://b.example/two": [301, "https://a.example/one"],
  });
  const tell = await theUrlTell("https://a.example/one", { fetchImpl: fetch });
  assertEquals(tell.verdict, "blocked");
  assertEquals(tell.reason, "redirect loop");
});

Deno.test("theUrlTell: a 200 with a meta refresh gets exactly one more hop", async () => {
  const fetch = fakeFetch({
    "https://gate.example/s": [200, null, `<meta http-equiv="refresh" content="0; url=https://real.example/page">`],
    "https://real.example/page": [200, null, "<html>the real thing</html>"],
  });
  const tell = await theUrlTell("https://gate.example/s", { fetchImpl: fetch });
  assertEquals(tell.verdict, "clear");
  assertEquals(tell.destination, "https://real.example/page");
});

Deno.test("theUrlTell fails closed when the chain breaks", async () => {
  const fetch = fakeFetch({}); // no routes: everything throws
  const tell = await theUrlTell("https://gone.example/x", { fetchImpl: fetch });
  assertEquals(tell.verdict, "blocked");
  assertEquals(tell.destination, null);
});

Deno.test("theUrlTell: a link that is not a link is told as such", async () => {
  const tell = await theUrlTell("javascript:alert(1)");
  assertEquals(tell.verdict, "blocked");
  assertEquals(tell.destination, null);
});
