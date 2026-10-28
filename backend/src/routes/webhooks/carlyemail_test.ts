// the carlyemail route, structurally: svix signature (both header
// spellings), replay gate, sender gate, event_id dedupe.

import { assertEquals } from "jsr:@std/assert@1";
import { Hono } from "hono";
import { carlyEmailRouter } from "./carlyemail.ts";
import { base64Decode, hmacSha256Base64KeyBytes } from "../../services/webhook_sigs.ts";

// a real svix-shaped secret: base64 of 32 bytes
const SECRET = "whsec_AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

function nowSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

function carlyEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "event",
    event_type: "message.received",
    event_id: "evt_carly_1",
    message: {
      inbox_id: "prixie@yourdomain.com",
      message_id: "msg_carly_1",
      thread_id: "thd_1",
      subject: "standup tomorrow",
      text: "no link in this one",
      from: { address: "priya@example.com", name: "Priya" },
    },
    thread: { thread_id: "thd_1" },
    ...overrides,
  };
}

async function postCarly(event: Record<string, unknown>, opts: {
  id?: string;
  timestamp?: string;
  secret?: string;
  tamper?: boolean;
  svixSpelling?: boolean;
} = {}): Promise<Response> {
  const body = JSON.stringify(event);
  const id = opts.id ?? "evt_carly_1";
  const ts = opts.timestamp ?? nowSec();
  const secret = opts.secret ?? SECRET;
  const key = base64Decode(secret.replace(/^whsec_/, ""));
  const sig = "v1," + (await hmacSha256Base64KeyBytes(key, `${id}.${ts}.${body}`));
  const app = new Hono();
  app.route("/webhooks/carlyemail", carlyEmailRouter);
  const idHeader = (opts.svixSpelling ? "svix-id" : "webhook-id");
  const tsHeader = (opts.svixSpelling ? "svix-timestamp" : "webhook-timestamp");
  const sigHeader = (opts.svixSpelling ? "svix-signature" : "webhook-signature");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [idHeader]: id,
    [tsHeader]: ts,
  };
  headers[sigHeader] = opts.tamper ? "v1,deadbeef=" : sig;
  return await app.request("/webhooks/carlyemail/inbound", { method: "POST", headers, body });
}

Deno.test("carlyemail: unset secret = the route stays closed", async () => {
  Deno.env.delete("CARLYEMAIL_SIGNING_SECRET");
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    assertEquals((await postCarly(carlyEvent())).status, 401);
  } finally {
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("carlyemail: svix gates (tamper, stale, wrong secret, both spellings)", async () => {
  Deno.env.set("CARLYEMAIL_SIGNING_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    assertEquals((await postCarly(carlyEvent(), { tamper: true })).status, 401);
    assertEquals(
      (await postCarly(carlyEvent(), { timestamp: String(Math.floor(Date.now() / 1000) - 4000) })).status,
      401,
    );
    assertEquals((await postCarly(carlyEvent(), { secret: "whsec_AQEBAQ==" })).status, 401);

    // the svix-* spelling verifies identically
    const res = await postCarly(carlyEvent({ event_id: "evt_svix_spelling" }), {
      id: "evt_svix_spelling",
      svixSpelling: true,
    });
    assertEquals(res.status, 422); // whitelisted, no link: honest
  } finally {
    Deno.env.delete("CARLYEMAIL_SIGNING_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("carlyemail: sender gate, honest no-link, sent ignored, dedupe", async () => {
  Deno.env.set("CARLYEMAIL_SIGNING_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    const stranger = carlyEvent({
      event_id: "evt_stranger_c",
      message: { ...(carlyEvent().message as any), from: { address: "stranger@example.com", name: "S" } },
    });
    assertEquals((await postCarly(stranger, { id: "evt_stranger_c" })).status, 403);

    const ok = await postCarly(carlyEvent());
    assertEquals(ok.status, 422);
    assertEquals((await ok.json()).created, false);

    const sent = await postCarly(carlyEvent({ event_id: "evt_c_sent", event_type: "message.sent" }), {
      id: "evt_c_sent",
    });
    assertEquals(sent.status, 200);
    assertEquals((await sent.json()).ignored, "message.sent");

    // at-least-once delivery: the same event twice processes once
    const first = await postCarly(carlyEvent({ event_id: "evt_c_dedupe" }), { id: "evt_c_dedupe" });
    const second = await postCarly(carlyEvent({ event_id: "evt_c_dedupe" }), { id: "evt_c_dedupe" });
    assertEquals(first.status, 422);
    assertEquals((await second.json()).duplicate, true);
  } finally {
    Deno.env.delete("CARLYEMAIL_SIGNING_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});
