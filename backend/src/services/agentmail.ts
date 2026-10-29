// agentmail: the dedicated inbox. link sourcing's first citizen.
//
// prixie gets her own address (an agentmail-style inbox: a real mailbox
// with an inbound webhook api). you forward the invite to her, she reads
// it, finds the join link, and joins. no calendar needed, no provider
// lock-in: the email IS the meeting source, which is why it ships first.
//
// flow: agentmail provider -> POST /webhooks/agentmail (shared secret) ->
// agentMailInbound(payload) here -> the same extractMeetingUrl /
// detectPlatform every other source uses -> createMeeting. the meeting
// manager deploys her like any other meeting.
//
// the payload shape is the agentmail inbound-email convention: { from,
// subject, text, html, message_id }. the transport (webhook route)
// verifies the secret; this module stays pure except for createMeeting.

import { createMeeting } from "./supabase.ts";
import { scopeFor } from "./memory_scope.ts";
import { ingestMemory } from "./retelldb.ts";
import { detectPlatform, extractMeetingUrl } from "./calendar_sync.ts";
import { parseColloquialTime } from "./colloquial_time.ts";

import { assertLinkSafe } from "./link_safety.ts";

export interface AgentMailMessage {
  message_id: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  date?: string;
}

export interface AgentMailResult {
  created: boolean;
  reason: string;
  meeting_id?: string;
  join_url?: string;
  platform?: string;
}

// the meeting link from a forwarded email, or null. checks the plain text
// body first (forwarded invites are text at heart), then the html.
export function findMeetingLink(msg: AgentMailMessage): string | null {
  const bodies = [msg.text, stripHtml(msg.html || "")].filter(Boolean) as string[];
  for (const body of bodies) {
    const link = extractMeetingUrl(body, "");
    if (link) return link;
  }
  return null;
}

// html -> text, coarse: tags out, entities decoded. the link extraction
// works on urls; the wrapper text rarely matters. hrefs come first: the
// join link usually lives in an href attribute, not in the visible text
// ("join the meeting" as the anchor text would otherwise lose it).
export function stripHtml(html: string): string {
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((m) => m[1])
    .join(" ");
  return `${hrefs} ${html}`
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

// one forwarded email -> one meeting she will join. if the invite carries
// no time (a bare link), she joins in five minutes: forwarding it to her
// is the instruction to be there.
export async function agentMailInbound(msg: AgentMailMessage): Promise<AgentMailResult> {
  const joinUrl = findMeetingLink(msg);
  if (!joinUrl) {
    return { created: false, reason: "no meeting link found in the forwarded email" };
  }

  // the safety gate: even a whitelisted sender's mail can carry a
  // poisoned link (compromised account, tracking redirect). she does
  // not join through a link the gate rejects.
  const verdict = await assertLinkSafe(joinUrl);
  if (!verdict.safe) {
    console.warn(`prixie: inbound join link blocked: ${verdict.reason} (${joinUrl})`);
    return { created: false, reason: `join link blocked by safety gate: ${verdict.reason}` };
  }

  const platform = detectPlatform(joinUrl) || "custom";

  // the email's own date is the truth when the mailer sent one. prose
  // time is next: "see you at 3pm est" in the body is a real schedule,
  // converted to utc by the colloquial parser. only when the email says
  // neither do we fall back to "be there in five minutes": forwarding it
  // to her is the instruction to be there.
  const body = [msg.text, stripHtml(msg.html || "")].filter(Boolean).join(" ");
  const prose = body ? parseColloquialTime(body) : null;
  const startTime = msg.date
    || (prose?.iso && !prose.partial ? prose.iso : null)
    || new Date(Date.now() + 5 * 60 * 1000).toISOString();

  try {
    const meeting = await createMeeting({
      title: msg.subject || `forwarded meeting (${platform})`,
      platform,
      join_url: joinUrl,
      start_time: startTime,
      instruction: (msg.text || stripHtml(msg.html || "")).slice(0, 2000),
      join_delay_minutes: 0,
      attendance_method: "none",
    });

    // the head learns who asked, anchored: the mail's sender resolves to
    // a connection (the owner's own address is the common case), and the
    // write carries platform + connection provenance so later reads can
    // carry a person's context across surfaces. fire-and-forget: a
    // memory failure never takes the join down.
    const scope = scopeFor("email", msg.from);
    void ingestMemory(
      `the owner forwarded a meeting invite by email: "${msg.subject || "(no subject)"}" ` +
        `(${platform}, ${new URL(joinUrl).host}). she found the join link and is joining.`,
      scope,
      { title: `inbound invite: ${msg.subject || platform}`, sourceUri: joinUrl },
    );

    return {
      created: true,
      reason: "forwarded to prixie: she found the link and will join",
      meeting_id: meeting.id,
      join_url: joinUrl,
      platform,
    };
  } catch (err: any) {
    return { created: false, reason: `createMeeting failed: ${err.message}` };
  }
}
