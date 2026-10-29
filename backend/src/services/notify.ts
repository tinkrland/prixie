// owner notify: the instant push. a captured code that is only redeemable
// during the meeting itself ("redemption window = meeting time") is useless
// in a post-meeting recap, so a match pushes to the owner immediately.
//
// email is the first channel because it is the easiest: agentmail outbound
// rest, one post, creds she already has from the inbound side. the channel
// list is long (sms, discord dm, signal, slack dm, whatsapp, imessage,
// telegram), and every later channel plugs into the same notifyOwner call.
//
// honest contract: the capture is already stored in supabase before this
// runs. a notify failure logs a warning and never takes the capture path
// down. no creds configured means no-op with a warn, not a crash.

import { outboundProvider, sendViaProvider } from "./mail_outbound.ts";

export interface NotifyEmail {
  subject: string;
  body: string;
}

// the window from the words being said (services/expiry_window.ts): the
// email escalates only when the speaker actually said when it dies
export interface ExpiryInfo {
  kind: string;
  minutes?: number;
  expiresAt?: string;
  quote: string;
  urgent: boolean;
}

const AGENTMAIL_API = "https://api.agentmail.to/v0";

export function buildCaptureEmail(
  opts: {
    meetingTitle: string;
    captureTitle: string;
    snippet: string;
    link?: string;
    capturedAt: Date;
    expiry?: ExpiryInfo | null;
    scarcity?: string | null;
    // who this meeting is, per the anchors (memory_recall.hostReceiptLine).
    // null = say nothing: no anchor config, or nothing worth saying.
    hostLine?: string | null;
  },
): NotifyEmail {
  const when = opts.capturedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const lines = [
    `captured live in: ${opts.meetingTitle}`,
    `watching for: ${opts.captureTitle}`,
    "",
    opts.snippet,
    "",
  ];
  if (opts.link) {
    lines.push(`link from chat: ${opts.link}`, "");
  }
  lines.push(`captured at ${when}, while the meeting is still running.`);

  // the supply side of urgency: "once they're out they're out" has no
  // clock in it, so it rides as the quote it is, never a fake window
  if (opts.scarcity) {
    lines.push(`scarcity heard in the meeting: "${opts.scarcity}"`);
  }

  // the urgency is only ever what the words said: "expires in 10
  // minutes" gets the clock; silence keeps the honest generic line
  const e = opts.expiry;
  if (e) {
    lines.push(`expiry heard in the meeting: "${e.quote}"`);
    if (e.minutes !== undefined && e.expiresAt) {
      const at = e.expiresAt.replace("T", " ").slice(0, 16) + " UTC";
      lines.push(`window: about ${e.minutes} minutes, roughly ${at}.`);
    } else if (e.kind === "meeting_end") {
      lines.push("window: it closes when the meeting ends.");
    } else if (e.kind === "today") {
      lines.push("window: it closes today.");
    }
    if (e.urgent) {
      lines.push("redeem it now, this one does not wait for the recap.");
    } else {
      lines.push("redeem it soon, before the window closes.");
    }
  } else if (opts.scarcity) {
    lines.push("get it now: the supply will not wait for the recap.");
  } else {
    lines.push("if this code expires when the meeting ends, redeem it now.");
  }

  if (opts.hostLine) lines.push(opts.hostLine);

  // the subject escalates on a heard window: the inbox subject line is
  // the push, "~10 min" in it beats any body text for speed
  const suffix = opts.expiry?.minutes !== undefined
    ? ` (expires in ~${opts.expiry.minutes} min)`
    : opts.expiry
    ? " (time limited)"
    : opts.scarcity
    ? " (limited supply)"
    : "";
  return {
    subject: `prixie: captured "${opts.captureTitle}" in ${opts.meetingTitle}${suffix}`,
    body: lines.join("\n"),
  };
}

export async function notifyOwner(email: NotifyEmail): Promise<boolean> {
  // the relay-back can ride any outbound provider (PRIXIE_OUTBOUND_MAIL,
  // unset = agentmail). the two true-inbox providers have their own
  // senders; agentmail keeps the one below.
  const via = await sendViaProvider(outboundProvider(), email);
  if (via !== null) return via;

  const apiKey = Deno.env.get("AGENTMAIL_API_KEY");
  const inboxId = Deno.env.get("AGENTMAIL_INBOX_ID");
  const to = Deno.env.get("PRIXIE_OWNER_EMAIL");

  if (!apiKey || !inboxId || !to) {
    console.warn(
      "prixie: owner notify skipped, no email creds (AGENTMAIL_API_KEY, AGENTMAIL_INBOX_ID, PRIXIE_OWNER_EMAIL)",
    );
    return false;
  }

  try {
    const res = await fetch(
      `${AGENTMAIL_API}/inboxes/${inboxId}/messages/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        // text, not body: agentmail silently accepts "body" and sends an
        // empty message (verified live oct 25 2026), so the field name is
        // the difference between an email and a blank one
        body: JSON.stringify({ to, subject: email.subject, text: email.body }),
      },
    );
    if (!res.ok) {
      console.warn(`prixie: owner notify send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`prixie: owner notify errored: ${err.message}`);
    return false;
  }
}

// a match just happened: store first (the caller does), then push. the
// push is fire-and-forget by contract; the capture is the record of truth.
export async function notifyCaptureMatch(
  opts: Parameters<typeof buildCaptureEmail>[0],
): Promise<boolean> {
  return await notifyOwner(buildCaptureEmail(opts));
}

// the redeem receipt line for a heard expiry, so the owner reading the
// receipt knows the same urgency she heard
export function expiryReceiptLine(e: ExpiryInfo): string {
  if (e.minutes !== undefined) {
    return `expiry heard mid-meeting: "${e.quote}" (~${e.minutes} min)`;
  }
  return `expiry heard mid-meeting: "${e.quote}"`;
}
