// photon: the imessage front door (the owner, oct 25 2026).
//
// the reason imessage was last-priority is gone: photon.codes hosts
// the apple hardware themselves (the managed line) and the free tier
// carries up to 10 users, which is a whitelist by billing. the owner texts
// prixie a link, the same way she forwards an invite to her inbox:
// the message IS the meeting source. flow: photon/spectrum -> POST
// /webhooks/photon (hmac signed, v0 scheme, 5 minute staleness) ->
// photonInbound(payload) -> the same extractMeetingUrl /
// detectPlatform every source uses -> createMeeting. the meeting
// manager deploys her like any other meeting.
//
// the same rules as the inbox door, unchanged: the whitelist
// (PRIXIE_PHOTON_WHITELIST: e.164 numbers, comma separated, the owner's
// and only the owner's) is the join request. unset = closed. the link
// safety gate still runs on whatever the message carries, whitelisted
// sender or not. and one rule that is new to a blue bubble: the relay
// back runs over the same conversation, but ONLY to a whitelisted
// address, ever. the reply function refuses anyone else, structurally.
//
// the honest limits (verified from the docs, oct 25 2026): the free
// tier is a SHARED POOL line, so the number she texts from can differ
// across recipients (one recipient sees one number consistently; keep
// some traffic or the line goes dormant). no group creation on free.
// green bubbles (non-ios numbers in the 10) ride rcs/sms fallback,
// which is carrier-filtered, a different deliverability surface than
// imessage. email-addressed imessage works (the sender id can be an
// apple id email). outbound is not http: there is no public
// send-message endpoint, the spectrum-ts sdk holds the wire, so
// photonReply keeps a sender singleton and fails closed without creds.
//
// docs read oct 25 2026: docs.photon.codes webhooks (quickstart,
// events, verifying-signatures), providers/imessage
// (connection-and-routing), best-practices/imessage-deliverability.

import {
  detectPlatform,
  extractMeetingUrl,
} from "./calendar_sync.ts";
import { assertLinkSafe } from "./link_safety.ts";
import { parseColloquialTime } from "./colloquial_time.ts";
import { createMeeting } from "./supabase.ts";

export interface PhotonPayload {
  event: string;
  space?: { id?: string; platform?: string; type?: string; phone?: string };
  message?: {
    id?: string;
    sender?: { id?: string; platform?: string };
    content?: { type?: string; text?: string };
  };
}

// --- the signature gate (hmac v0, timing-safe, 5 minute freshness) ---

// spectrum signs every delivery: v0=<hmac-sha256-hex(secret,
// "v0:" + timestamp + ":" + rawBody)>. constant-time compare, and a
// delivery older than 5 minutes is a replay, not a message.
export async function verifyPhotonSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (age > 300) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`v0:${timestamp}:${rawBody}`),
  );
  const expected = "v0=" + [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

// --- the whitelist (the owner's numbers, env only, never the repo) ---

export function photonSenderWhitelisted(senderId: string | undefined): boolean {
  const raw = Deno.env.get("PRIXIE_PHOTON_WHITELIST");
  if (!raw) return false;
  const id = (senderId || "").trim().toLowerCase();
  if (!id) return false;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(id);
}

// --- the message -> meeting path (same as the inbox door) ---

export function photonMessageText(payload: PhotonPayload): string | null {
  if (payload.event !== "messages") return null;
  const content = payload.message?.content;
  if (!content || content.type !== "text" || !content.text) return null;
  return content.text;
}

export function photonWhitelistedSender(payload: PhotonPayload): string | null {
  const sender = payload.message?.sender?.id;
  return photonSenderWhitelisted(sender) ? String(sender) : null;
}

export interface PhotonResult {
  created: boolean;
  reason: string;
  meeting_id?: string;
  join_url?: string;
  platform?: string;
}

export async function photonInbound(
  payload: PhotonPayload,
): Promise<PhotonResult> {
  const text = photonMessageText(payload);
  if (!text) {
    return { created: false, reason: "no text in the message (reactions and attachments are not join requests)" };
  }
  const joinUrl = extractMeetingUrl(text, "");
  if (!joinUrl) {
    return { created: false, reason: "no meeting link found in the message" };
  }

  // the safety gate: even the owner's message can carry a poisoned link
  // (compromised account, tracking redirect). she does not join
  // through a link the gate rejects.
  const verdict = await assertLinkSafe(joinUrl);
  if (!verdict.safe) {
    console.warn(`prixie: inbound join link blocked: ${verdict.reason} (${joinUrl})`);
    return { created: false, reason: `join link blocked by safety gate: ${verdict.reason}` };
  }

  const platform = detectPlatform(joinUrl) || "custom";

  // the message's own words are the schedule when they carry one:
  // "join this at 3pm est" is a real schedule, parsed colloquially.
  // otherwise a text is the instruction to be there now-ish.
  const prose = parseColloquialTime(text);
  const startTime = (prose?.iso && !prose.partial ? prose.iso : null) ||
    new Date(Date.now() + 5 * 60 * 1000).toISOString();

  try {
    const meeting = await createMeeting({
      title: `imessage forward (${platform})`,
      platform,
      join_url: joinUrl,
      start_time: startTime,
      instruction: text.slice(0, 2000),
      join_delay_minutes: 0,
      attendance_method: "none",
    });
    return {
      created: true,
      reason: "texted to prixie: she found the link and will join",
      meeting_id: meeting.id,
      join_url: joinUrl,
      platform,
    };
  } catch (err: any) {
    return { created: false, reason: `createMeeting failed: ${err.message}` };
  }
}

// --- the relay back (outbound is the sdk, not http, and never to a stranger) ---

export function photonConfigured(): boolean {
  return Boolean(Deno.env.get("PHOTON_PROJECT_ID") && Deno.env.get("PHOTON_PROJECT_SECRET"));
}

let sender: { reply: (to: string, body: string) => Promise<boolean> } | null = null;

// the relay: reply in the same imessage conversation. spectrum has no
// public http send endpoint (docs, oct 25 2026): the sdk holds the
// wire in a long-lived process. this keeps a lazily built sender
// singleton and fails closed without creds. the whitelist rule is
// structural: the reply refuses any recipient outside it, ever.
export async function photonReply(to: string, body: string): Promise<boolean> {
  if (!photonSenderWhitelisted(to)) {
    console.warn(`prixie: photon reply refused, recipient not whitelisted: ${to}`);
    return false;
  }
  if (!photonConfigured()) return false;
  try {
    if (!sender) {
      const mod: any = await import("npm:spectrum-ts");
      const imMod: any = await import("npm:spectrum-ts/providers/imessage");
      const app = await mod.Spectrum({
        projectId: Deno.env.get("PHOTON_PROJECT_ID"),
        projectSecret: Deno.env.get("PHOTON_PROJECT_SECRET"),
        providers: [imMod.imessage.config()],
      });
      const im = imMod.imessage(app);
      sender = {
        reply: async (recipient, text) => {
          const user = await im.user(recipient);
          const space = await im.space(user);
          await space.send(mod.text(text));
          return true;
        },
      };
    }
    return await sender.reply(to, body);
  } catch (err: any) {
    console.warn(`prixie: photon reply failed: ${err.message}`);
    sender = null; // the wire may be dead: rebuild on the next attempt
    return false;
  }
}
