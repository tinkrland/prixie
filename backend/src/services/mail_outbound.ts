// outbound mail: the relay-back seam, multi-provider (anne, oct 28 2026).
//
// the take-home (owner notify) rode agentmail rest because that was the
// only rail. the true-inbox providers can SEND too, from the SAME
// domain the mail arrives at, so the owner with a dearagent worker or
// a carlyemail inbox can relay back through their own provider
// instead of an agentmail address.
//
// selection is explicit: PRIXIE_OUTBOUND_MAIL = agentmail | dearagent |
// carlyemail. unset = agentmail, the incumbent, so existing deploys
// change nothing until the owner says so.
//
// every sender obeys the notify contract: creds missing = warn + no,
// never a crash; a failed send never takes the capture path down.

import type { NotifyEmail } from "./notify.ts";

const CARLY_API = "https://api.carlyemail.com/v0";

export type OutboundMailProvider = "agentmail" | "dearagent" | "carlyemail";

export function outboundProvider(): OutboundMailProvider {
  const raw = (Deno.env.get("PRIXIE_OUTBOUND_MAIL") || "").trim().toLowerCase();
  if (raw === "dearagent" || raw === "carlyemail" || raw === "agentmail") return raw;
  return "agentmail";
}

// dearagent (self-hosted worker): POST {base}/inboxes/:inbox/messages
// composes new mail. the inbox id IS the lowercased address, url-encode
// the @. recipients may be bare addresses (readme: "a@b.c" works).
export async function sendViaDearAgent(email: NotifyEmail): Promise<boolean> {
  const base = Deno.env.get("DEARAGENT_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("DEARAGENT_API_KEY");
  const fromInbox = Deno.env.get("DEARAGENT_FROM_INBOX")?.toLowerCase();
  const to = Deno.env.get("PRIXIE_OWNER_EMAIL");

  if (!base || !apiKey || !fromInbox || !to) {
    console.warn(
      "prixie: dearagent outbound skipped, no creds (DEARAGENT_BASE_URL, DEARAGENT_API_KEY, DEARAGENT_FROM_INBOX, PRIXIE_OWNER_EMAIL)",
    );
    return false;
  }

  try {
    const res = await fetch(
      `${base}/inboxes/${encodeURIComponent(fromInbox)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to, subject: email.subject, text: email.body }),
      },
    );
    if (!res.ok) {
      console.warn(`prixie: dearagent outbound send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`prixie: dearagent outbound errored: ${err.message}`);
    return false;
  }
}

// carlyemail (hosted): POST /v0/inboxes/:inboxId/messages/send. the
// docs' own order: text, or html, or both. "to" is an ARRAY (verified
// from the sending guide), unlike agentmail's single address.
export async function sendViaCarly(email: NotifyEmail): Promise<boolean> {
  const apiKey = Deno.env.get("CARLYEMAIL_API_KEY");
  const inboxId = Deno.env.get("CARLYEMAIL_INBOX_ID");
  const to = Deno.env.get("PRIXIE_OWNER_EMAIL");

  if (!apiKey || !inboxId || !to) {
    console.warn(
      "prixie: carlyemail outbound skipped, no creds (CARLYEMAIL_API_KEY, CARLYEMAIL_INBOX_ID, PRIXIE_OWNER_EMAIL)",
    );
    return false;
  }

  try {
    const res = await fetch(
      `${CARLY_API}/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to: [to], subject: email.subject, text: email.body }),
      },
    );
    if (!res.ok) {
      console.warn(`prixie: carlyemail outbound send failed: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`prixie: carlyemail outbound errored: ${err.message}`);
    return false;
  }
}

// the provider-agnostic send used by notifyOwner. agentmail's own
// sender stays in notify.ts (it was there first); this routes the two
// new providers and returns null when the selection is agentmail, so
// the caller keeps its existing path untouched.
export async function sendViaProvider(
  provider: OutboundMailProvider,
  email: NotifyEmail,
): Promise<boolean | null> {
  if (provider === "dearagent") return await sendViaDearAgent(email);
  if (provider === "carlyemail") return await sendViaCarly(email);
  return null; // agentmail: the caller's own sender
}
