// the whatsapp text rail (anne, oct 29 2026). shapes pinned against
// WAHA's own docs: the envelope {timestamp, event, session, payload},
// the X-Webhook-Hmac / X-Webhook-Hmac-Algorithm headers over the raw
// body, and POST /api/sendText {session, chatId, text} with X-Api-Key.
//
// these tests never reach WAHA and never need a phone: they pin the
// verification rules and the no-op paths. the link path stops at the
// point the meeting core starts, which is the distinct no-link case
// (the same discipline the agentmail tests use).

import { assertEquals } from "jsr:@std/assert@1.0.19";
import { hmacSha512Hex } from "../../services/webhook_sigs.ts";

const KEY = "test-waha-hmac-key";
const WHITELIST = "15550001111, +1 555 000 2222";

let seq = 0;

function body(over: Record<string, unknown> = {}, payload: Record<string, unknown> = {}) {
  seq += 1;
  return JSON.stringify({
    timestamp: Date.now(),
    event: "message",
    session: "default",
    me: { id: "19990000000@c.us", pushName: "prixie" },
    payload: {
      id: `false_15550001111@c.us_TEST${seq}`,
      from: "15550001111@c.us",
      fromMe: false,
      body: "hey, saying hi",
      ...payload,
    },
    ...over,
  });
}

async function call(bodyText: string, opts: { key?: string; sig?: string; algo?: string } = {}) {
  const { default: wahaRouter } = await import("./waha.ts");
  const sig = opts.sig ?? (await hmacSha512Hex(opts.key ?? KEY, bodyText));
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig !== "none") headers["x-webhook-hmac"] = sig;
  headers["x-webhook-hmac-algorithm"] = opts.algo ?? "sha512";
  if (opts.key === undefined) {
    Deno.env.set("WAHA_HMAC_KEY", KEY);
  }
  return await wahaRouter.request("/inbound", { method: "POST", headers, body: bodyText });
}

Deno.test("whatsapp inbound: unset hmac key closes the route", async () => {
  Deno.env.delete("WAHA_HMAC_KEY");
  // the digest is computed with the REAL key: the route must still refuse,
  // and it must refuse because the key is unset, not because the digest is
  // wrong (which would prove nothing about the closure)
  const res = await call(body(), { key: KEY });
  assertEquals(res.status, 401);
});

Deno.test("whatsapp inbound: a wrong digest is refused", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  const res = await call(body(), { sig: "deadbeef" });
  assertEquals(res.status, 401);
});

Deno.test("whatsapp inbound: an unsupported algorithm is refused, never assumed", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  const res = await call(body(), { algo: "sha256" });
  assertEquals(res.status, 401);
});

Deno.test("whatsapp inbound: a stale envelope is refused (replay window)", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  const old = body({ timestamp: (Date.now() - 10 * 60 * 1000) });
  const res = await call(old);
  assertEquals(res.status, 401);
});

Deno.test("whatsapp inbound: non-message events are acknowledged and ignored", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  const res = await call(body({ event: "message.ack" }));
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ignored, "event");
});

Deno.test("whatsapp inbound: her own outgoing message is never relayed back", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  const res = await call(body({}, { fromMe: true }));
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ignored, "from_me");
});

Deno.test("whatsapp inbound: a stranger's text does nothing, and says so", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  Deno.env.set("PRIXIE_WHATSAPP_WHITELIST", WHITELIST);
  const res = await call(body({}, { from: "19991112222@c.us" }));
  const json = await res.json();
  assertEquals(json.ignored, "sender_not_whitelisted");
});

Deno.test("whatsapp inbound: a group id is never a whitelisted sender", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  Deno.env.set("PRIXIE_WHATSAPP_WHITELIST", WHITELIST);
  const res = await call(body({}, { from: "15550001111@g.us" }));
  const json = await res.json();
  assertEquals(json.ignored, "sender_not_whitelisted");
});

Deno.test("whatsapp inbound: a whitelisted text without a link stops at no_join_link", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  Deno.env.set("PRIXIE_WHATSAPP_WHITELIST", WHITELIST);
  const res = await call(body());
  const json = await res.json();
  assertEquals(json.ignored, "no_join_link");
});

Deno.test("whatsapp inbound: retries of the same message are deduped", async () => {
  Deno.env.set("WAHA_HMAC_KEY", KEY);
  Deno.env.set("PRIXIE_WHATSAPP_WHITELIST", WHITELIST);
  const retryBody = body();
  const first = await call(retryBody);
  const firstJson = await first.json();
  const again = await call(retryBody);
  const againJson = await again.json();
  // the first pass reached the join path; the second never does twice
  assertEquals(firstJson.ignored, "no_join_link");
  assertEquals(againJson.ignored, "duplicate");
});

Deno.test("whatsapp whitespace and a plus in the whitelist still match", async () => {
  Deno.env.set("PRIXIE_WHATSAPP_WHITELIST", WHITELIST);
  const { whatsappWhitelisted } = await import("./waha.ts");
  assertEquals(whatsappWhitelisted("15550002222@c.us"), true);
  assertEquals(whatsappWhitelisted("15550003333@c.us"), false);
});

Deno.test("whatsapp send: unset config is a warn and a no, never a throw", async () => {
  Deno.env.delete("WAHA_BASE_URL");
  Deno.env.delete("WAHA_API_KEY");
  const { sendWhatsApp } = await import("../../services/whatsapp_relay.ts");
  const res = await sendWhatsApp("15550001111", "hi");
  assertEquals(res.sent, false);
  assertEquals(res.reason, "no_config");
});

Deno.test("whatsapp send: the id shape is pinned to @c.us and personal numbers only", async () => {
  const { whatsappChatId } = await import("../../services/whatsapp_ids.ts");
  assertEquals(whatsappChatId("15550001111"), "15550001111@c.us");
  assertEquals(whatsappChatId("+1 555 000 1111"), null); // formatting is the caller's job
  assertEquals(whatsappChatId("123456@g.us"), null);
});
