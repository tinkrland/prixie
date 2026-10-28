// the dearagent.sh webhook: a TRUE inbox on the owner's own domain.
//
// dearagent (github.com/panda-sandeep/dearagent) is the open-source,
// self-hosted inbox api for agents: one cloudflare worker, email
// routing catch-all on a domain the owner dedicates to it, d1 for
// mail, r2 for attachments. nothing ever leaves the owner's
// cloudflare account. it is the alternative to forwarding a domain's
// mail to an agentmail address: the mail arrives at the domain
// itself, the worker holds it, and this route is what it wakes.
//
// delivery contract (verified from the repo's readme, oct 28 2026):
// events message.received + message.sent, headers X-DearAgent-Event /
// X-DearAgent-Delivery / X-DearAgent-Timestamp (unix seconds) /
// X-DearAgent-Signature: sha256=<hmac-sha256-hex(secret,
// `${timestamp}.${rawBody}`)>. retries three times (0s, 1s, 4s) on
// network errors and 5xx, so a 2xx here must be honest: a processed
// event is remembered and a retry of the same event id is answered
// politely, never processed twice.
//
// DEARAGENT_WEBHOOK_SECRET (env) = the webhook secret set when the
// dearagent webhook was registered. unset = the route stays closed.

import { Hono } from "hono";
import { agentMailInbound, type AgentMailMessage } from "../../services/agentmail.ts";
import { mailSenderWhitelisted } from "../../services/mail_whitelist.ts";
import { constantTimeEqual, freshUnixSeconds, hmacSha256Hex } from "../../services/webhook_sigs.ts";

const dearAgentRouter = new Hono();

// at-least-once delivery: event ids remembered for half an hour (the
// provider's own retry window is seconds, the margin is generous). a
// server restart forgets them, honestly: the inbound handler treats a
// replayed join request the same as a duplicate forward.
const seenEvents = new Map<string, number>();
const SEEN_WINDOW_MS = 30 * 60 * 1000;
function seenBefore(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  for (const [k, t] of seenEvents) if (now - t > SEEN_WINDOW_MS) seenEvents.delete(k);
  if (seenEvents.has(id)) return true;
  if (seenEvents.size > 500) seenEvents.clear();
  seenEvents.set(id, now);
  return false;
}

dearAgentRouter.post("/inbound", async (c) => {
  const secret = Deno.env.get("DEARAGENT_WEBHOOK_SECRET");
  // unset secret = route closed, not open
  if (!secret) return c.json({ error: "unauthorized" }, 401);

  const rawBody = await c.req.text();
  const timestamp = c.req.header("x-dearagent-timestamp");
  const signature = c.req.header("x-dearagent-signature");

  if (!freshUnixSeconds(timestamp)) {
    return c.json({ error: "stale or missing timestamp" }, 401);
  }

  const expected = "sha256=" + (await hmacSha256Hex(secret, `${timestamp}.${rawBody}`));
  if (!signature || !constantTimeEqual(expected, signature)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  // her own outbound mail is not a join request: acknowledged, ignored
  if (event?.type !== "message.received") return c.json({ ok: true, ignored: event?.type });

  if (seenBefore(event?.id)) return c.json({ ok: true, duplicate: true });

  const msg = event?.message || {};
  const from = msg?.from?.address || msg?.from;
  const text = msg?.text;
  if (!msg?.id || (!text && !msg?.html)) {
    return c.json({ error: "message id and a body are required" }, 400);
  }

  // the sender gate: a true inbox does not mean everyone who mails the
  // domain gets a meeting joined. same whitelist as the forward path.
  if (!mailSenderWhitelisted(from)) {
    console.warn(`prixie: dearagent mail from unwhitelisted sender rejected: ${from}`);
    return c.json({ error: "sender not whitelisted" }, 403);
  }

  const mapped: AgentMailMessage = {
    message_id: msg.id,
    from: from || "unknown@unknown",
    subject: msg.subject || "",
    text,
    html: msg.html,
    date: msg.received_at_ms ? new Date(msg.received_at_ms).toISOString() : undefined,
  };

  const result = await agentMailInbound(mapped);
  return c.json(result, result.created ? 201 : 422);
});

dearAgentRouter.get("/status", (c) =>
  c.json({
    inbox: "dearagent.sh",
    route: "/webhooks/dearagent/inbound",
    open: !!Deno.env.get("DEARAGENT_WEBHOOK_SECRET"),
  }),
);

export { dearAgentRouter };
