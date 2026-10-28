// the carlyemail webhook: a hosted TRUE inbox, with real custom
// domains (spf/dkim/dmarc set up by the provider).
//
// carlyemail.com gives an agent a real inbox on the provider's domain
// or the owner's own (agent@yourdomain.com), pushing a signed event
// the second mail arrives. it is the hosted counterpart to
// dearagent.sh's self-hosted worker: no cloudflare account of the
// owner's needed, and the mail address still IS the owner's domain,
// not a forward.
//
// delivery contract (verified from docs.carlyemail.com/guides/webhooks,
// oct 28 2026): the svix scheme. headers webhook-id /
// webhook-timestamp (unix seconds) / webhook-signature (also sent with
// svix-* spellings). signature = v1,<base64(hmac-sha256(base64-decode(
// secret minus the whsec_ prefix), `${id}.${timestamp}.${rawBody}`))>.
// at-least-once with a long retry ladder (up to seven attempts over
// ~18 hours), so events are deduplicated by event_id; the docs
// themselves warn to reject stale deliveries (replay protection).
//
// CARLYEMAIL_SIGNING_SECRET (env) = the whsec_... secret shown once
// when the webhook was created. unset = the route stays closed.

import { Hono } from "hono";
import { agentMailInbound, type AgentMailMessage } from "../../services/agentmail.ts";
import { mailSenderWhitelisted } from "../../services/mail_whitelist.ts";
import {
  base64Decode,
  base64EncodeBytes,
  constantTimeEqual,
  freshUnixSeconds,
  hmacSha256Base64KeyBytes,
} from "../../services/webhook_sigs.ts";

const carlyEmailRouter = new Hono();

const seenEvents = new Map<string, number>();
const SEEN_WINDOW_MS = 6 * 60 * 60 * 1000; // the retry ladder spans ~18h; the window is honest, not infinite
function seenBefore(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of seenEvents) if (now - t > SEEN_WINDOW_MS) seenEvents.delete(k);
  if (seenEvents.has(id)) return true;
  if (seenEvents.size > 500) seenEvents.clear();
  seenEvents.set(id, now);
  return false;
}

carlyEmailRouter.post("/inbound", async (c) => {
  const secretRaw = Deno.env.get("CARLYEMAIL_SIGNING_SECRET");
  if (!secretRaw) return c.json({ error: "unauthorized" }, 401);

  // svix: the key is the secret base64-decoded, whsec_ prefix stripped
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64Decode(secretRaw.replace(/^whsec_/, ""));
  } catch {
    console.error("prixie: CARLYEMAIL_SIGNING_SECRET is not valid base64 (should be whsec_...)");
    return c.json({ error: "unauthorized" }, 401);
  }

  const rawBody = await c.req.text();
  const id = c.req.header("webhook-id") || c.req.header("svix-id");
  const timestamp = c.req.header("webhook-timestamp") || c.req.header("svix-timestamp");
  const signature = c.req.header("webhook-signature") || c.req.header("svix-signature");

  if (!id) return c.json({ error: "missing webhook id" }, 401);
  if (!freshUnixSeconds(timestamp)) {
    return c.json({ error: "stale or missing timestamp" }, 401);
  }

  const expected = "v1," +
    await hmacSha256Base64KeyBytes(keyBytes, `${id}.${timestamp}.${rawBody}`);
  if (!signature || !constantTimeEqual(expected, signature)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  if (event?.event_type !== "message.received") return c.json({ ok: true, ignored: event?.event_type });

  if (seenBefore(event?.event_id)) return c.json({ ok: true, duplicate: true });

  const msg = event?.message || {};
  const from = msg?.from?.address || msg?.from;
  const text = msg?.text;
  if (!msg?.message_id && !event?.event_id) {
    return c.json({ error: "no message id on the event" }, 400);
  }
  if (!text && !msg?.html) {
    return c.json({ error: "a body is required" }, 400);
  }

  // the sender gate, same as every inbox rail
  if (!mailSenderWhitelisted(from)) {
    console.warn(`prixie: carlyemail mail from unwhitelisted sender rejected: ${from}`);
    return c.json({ error: "sender not whitelisted" }, 403);
  }

  const mapped: AgentMailMessage = {
    message_id: msg.message_id || event.event_id,
    from: from || "unknown@unknown",
    subject: msg.subject || "",
    text,
    html: msg.html,
    date: msg.received_at ? new Date(msg.received_at).toISOString() : undefined,
  };

  const result = await agentMailInbound(mapped);
  return c.json(result, result.created ? 201 : 422);
});

carlyEmailRouter.get("/status", (c) =>
  c.json({
    inbox: "carlyemail.com",
    route: "/webhooks/carlyemail/inbound",
    open: !!Deno.env.get("CARLYEMAIL_SIGNING_SECRET"),
  }),
);

export { carlyEmailRouter };
