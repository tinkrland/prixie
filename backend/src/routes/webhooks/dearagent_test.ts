// the true-inbox provider routes, structurally: signature gates, replay
// gates, sender gates, dedupe. the shared handler's no-link path
// returns before any db work, so these tests never touch supabase.

import { assertEquals } from "jsr:@std/assert@1";
import { Hono } from "hono";
import { dearAgentRouter } from "./dearagent.ts";
import { hmacSha256Hex } from "../../services/webhook_sigs.ts";

const SECRET = "dear-agent-secret";

function nowSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

function dearEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt_test_1",
    type: "message.received",
    inbox_id: "prixie@mail.example.com",
    thread_id: "thr_1",
    message: {
      id: "msg_1",
      thread_id: "thr_1",
      direction: "inbound",
      from: { address: "priya@example.com", name: "Priya" },
      subject: "standup tomorrow",
      text: "no link in this one",
      received_at_ms: 1785640000000,
    },
    ...overrides,
  };
}

async function postDear(event: Record<string, unknown>, opts: {
  timestamp?: string;
  secret?: string;
  tamper?: boolean;
} = {}): Promise<Response> {
  const body = JSON.stringify(event);
  const ts = opts.timestamp ?? nowSec();
  const secret = opts.secret ?? SECRET;
  const sig = "sha256=" + (await hmacSha256Hex(secret, `${ts}.${body}`));
  const app = new Hono();
  app.route("/webhooks/dearagent", dearAgentRouter);
  return await app.request("/webhooks/dearagent/inbound", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dearagent-timestamp": ts,
      "x-dearagent-signature": opts.tamper ? "sha256=deadbeef" : sig,
    },
    body,
  });
}

Deno.test("dearagent: unset secret = the route stays closed", async () => {
  Deno.env.delete("DEARAGENT_WEBHOOK_SECRET");
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    const res = await postDear(dearEvent());
    assertEquals(res.status, 401);
  } finally {
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("dearagent: signature gates (tamper, stale, wrong secret)", async () => {
  Deno.env.set("DEARAGENT_WEBHOOK_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    assertEquals((await postDear(dearEvent(), { tamper: true })).status, 401);
    assertEquals(
      (await postDear(dearEvent(), { timestamp: String(Math.floor(Date.now() / 1000) - 4000) })).status,
      401,
    );
    assertEquals((await postDear(dearEvent(), { secret: "other-secret" })).status, 401);
  } finally {
    Deno.env.delete("DEARAGENT_WEBHOOK_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("dearagent: sender gate before she acts, honest no-link result after", async () => {
  Deno.env.set("DEARAGENT_WEBHOOK_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    // a stranger's mail is not a join request
    const stranger = dearEvent({ message: { ...(dearEvent().message as any), from: { address: "stranger@example.com", name: "Stranger" } } });
    stranger.id = "evt_stranger";
    assertEquals((await postDear(stranger)).status, 403);

    // whitelisted + no link = honest 422, no meeting invented
    const res = await postDear(dearEvent());
    assertEquals(res.status, 422);
    const body = await res.json();
    assertEquals(body.created, false);
  } finally {
    Deno.env.delete("DEARAGENT_WEBHOOK_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("dearagent: her own sent mail is acknowledged, never processed", async () => {
  Deno.env.set("DEARAGENT_WEBHOOK_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    const res = await postDear(dearEvent({ id: "evt_sent", type: "message.sent" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.ignored, "message.sent");
  } finally {
    Deno.env.delete("DEARAGENT_WEBHOOK_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});

Deno.test("dearagent: a retried event is deduplicated, never processed twice", async () => {
  Deno.env.set("DEARAGENT_WEBHOOK_SECRET", SECRET);
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com");
  try {
    const first = await postDear(dearEvent({ id: "evt_dedupe" }));
    const second = await postDear(dearEvent({ id: "evt_dedupe" }));
    assertEquals(first.status, 422);
    assertEquals(second.status, 200);
    assertEquals((await second.json()).duplicate, true);
  } finally {
    Deno.env.delete("DEARAGENT_WEBHOOK_SECRET");
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }
});
