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

export interface NotifyEmail {
  subject: string;
  body: string;
}

const AGENTMAIL_API = "https://api.agentmail.to/v0";

export function buildCaptureEmail(
  opts: {
    meetingTitle: string;
    captureTitle: string;
    snippet: string;
    link?: string;
    capturedAt: Date;
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
  lines.push("if this code expires when the meeting ends, redeem it now.");

  return {
    subject: `prixie: captured "${opts.captureTitle}" in ${opts.meetingTitle}`,
    body: lines.join("\n"),
  };
}

export async function notifyOwner(email: NotifyEmail): Promise<boolean> {
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
