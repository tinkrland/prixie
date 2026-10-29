// the whatsapp text rail (anne, oct 29 2026): WAHA (WhatsApp HTTP API)
// posts an event here when a message arrives, she reads it, and a link
// inside becomes a meeting the same way a forwarded invite does.
//
//   POST /webhooks/waha/inbound   WAHA event enqueue (session webhook)
//
// security, in the house shape:
//   - WAHA_HMAC_KEY (env) = config.webhooks[].hmac.key on the WAHA session.
//     unset = the route stays closed, never open.
//   - WAHA signs the RAW body: X-Webhook-Hmac (hex) with the algorithm
//     named in X-Webhook-Hmac-Algorithm (sha512). the digest must verify
//     against the bytes we received, not a re-serialization
//     (https://waha.devlike.pro/docs/how-to/events, verified oct 29 2026).
//   - stale events are refused: the envelope timestamp must be fresh, so a
//     captured delivery cannot be replayed a day later.
//   - replay of a recent event is deduped by payload id (WAHA retries).
//   - the sender must be whitelisted (PRIXIE_WHATSAPP_WHITELIST, digits
//     only, compare on the @c.us local part). unset = nobody, honestly:
//     a text rail with no list accepts no strangers.
//
// honest scope: this route only carries a TEXT message to the join path.
// WAHA needs a hosted relay instance linked to her own number (the
// horizon row), and the meta terms-of-service question is unchanged. no
// live run happened here: the shapes are pinned by tests only.

import { Hono } from "hono";
import { agentMailInbound } from "../../services/agentmail.ts";
import { extractMeetingUrl } from "../../services/calendar_sync.ts";
import { constantTimeEqual, freshUnixSeconds, hmacSha512Hex } from "../../services/webhook_sigs.ts";
import { whatsappDigits } from "../../services/whatsapp_ids.ts";

const wahaRouter = new Hono();

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

// "12132132130@c.us" -> "12132132130" (services/whatsapp_ids.ts owns the
// format); groups and broadcast lists are never whitelisted, a group
// message is not a person asking her
export const whatsappSenderDigits = whatsappDigits;

export function whatsappWhitelisted(from: string | undefined | null, list?: string): boolean {
  const digits = whatsappSenderDigits(from);
  if (!digits) return false;
  // env wins when given; otherwise the deployed env's value. digits only,
  // so a number written with spaces or a plus still matches
  const raw = list ?? Deno.env.get("PRIXIE_WHATSAPP_WHITELIST") ?? "";
  // entries are separated by , or ; only: a space or a plus INSIDE an
  // entry is number formatting ("+1 555 000 2222" is one number, not four)
  const allowed = raw
    .split(/[,;]+/)
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter(Boolean);
  return allowed.includes(digits);
}

// the text of an inbound message, when WAHA's payload carries one.
// payload.body is the plain text on the WEBJS/NOWEB engines; media events
// have no body and are ignored rather than guessed at.
export function whatsappText(payload: any): string | null {
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  return body || null;
}

wahaRouter.post("/inbound", async (c) => {
  const key = Deno.env.get("WAHA_HMAC_KEY");
  if (!key) return c.json({ error: "unauthorized" }, 401);

  const rawBody = await c.req.text();
  const algorithm = (c.req.header("x-webhook-hmac-algorithm") || "sha512").toLowerCase();
  const signature = c.req.header("x-webhook-hmac");

  if (algorithm !== "sha512") {
    // a digest we cannot compute is not verified by definition
    return c.json({ error: "unsupported signature algorithm" }, 401);
  }
  const expected = await hmacSha512Hex(key, rawBody);
  if (!signature || !constantTimeEqual(expected, signature.trim().toLowerCase())) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  // the envelope timestamp is milliseconds; refuse stale deliveries
  const ts = typeof event?.timestamp === "number" ? Math.floor(event.timestamp / 1000) : undefined;
  if (!freshUnixSeconds(ts === undefined ? undefined : String(ts))) {
    return c.json({ error: "stale or missing timestamp" }, 401);
  }

  // only a new text message is the rail. acks, statuses, presence and
  // her own outgoing messages are acknowledged and ignored, never relayed
  if (event?.event !== "message") {
    return c.json({ ok: true, ignored: "event", event: event?.event ?? null });
  }
  const payload = event?.payload;
  if (payload?.fromMe === true) {
    return c.json({ ok: true, ignored: "from_me" });
  }
  const messageId = typeof payload?.id === "string" ? payload.id : undefined;
  if (seenBefore(messageId)) {
    return c.json({ ok: true, ignored: "duplicate" });
  }
  if (!whatsappWhitelisted(payload?.from)) {
    // no whitelist configured and a stranger: nothing happens, and the
    // reply says exactly that so the relay logs are readable
    return c.json({ ok: true, ignored: "sender_not_whitelisted" });
  }

  const text = whatsappText(payload);
  if (!text) {
    return c.json({ ok: true, ignored: "no_text" });
  }

  const url = extractMeetingUrl(text);
  if (!url) {
    return c.json({ ok: true, ignored: "no_join_link" });
  }

  // the link path is the forwarded-invite path: same extraction, same
  // safety gate, same meeting row. the source is the whatsapp rail, so
  // the meeting says where it came from and from whom.
  const title = text.split("\n")[0].slice(0, 120) || "whatsapp join link";
  const result = await agentMailInbound({
    from: `${whatsappSenderDigits(payload?.from) ?? "unknown"}@whatsapp`,
    subject: title,
    text,
    message_id: messageId,
    date: new Date(event.timestamp).toISOString(),
  });
  return c.json({ ok: true, ...result });
});

export default wahaRouter;
