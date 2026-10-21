// the agentmail webhook: her inbox's front door.
//
// any agentmail-style provider that can POST an inbound email (agentmail
// itself, or a mailgun/postmark-style parser pointed at this route) sends
// { from, subject, text/html, message_id, date } with the shared secret in
// the x-agentmail-secret header. we verify, hand the message to
// agentMailInbound, and she joins.

import { Hono } from "hono";
import { agentMailInbound, type AgentMailMessage } from "../services/agentmail.ts";

const agentMailRouter = new Hono();

function authorized(headerSecret: string | undefined): boolean {
  const expected = Deno.env.get("AGENTMAIL_WEBHOOK_SECRET");
  // unset secret = route closed, not open. set the env to open the door.
  if (!expected) return false;
  return headerSecret === expected;
}

// the forward whitelist (the owner, oct 21 2026): only mail forwarded by
// whitelisted senders is a viable meeting joining request. PRIXIE_FORWARD_WHITELIST
// is a comma separated list of email addresses in env, never in the repo.
// unset whitelist = the door stays closed, same rule as the secret.
function senderWhitelisted(from: string | undefined): boolean {
  const raw = Deno.env.get("PRIXIE_FORWARD_WHITELIST");
  if (!raw) return false;
  const address = (from || "").match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase();
  if (!address) return false;
  return raw
    .split(",")
    .map((e) => e.trim().match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase())
    .filter(Boolean)
    .includes(address);
}

agentMailRouter.post("/inbound", async (c) => {
  if (!authorized(c.req.header("x-agentmail-secret"))) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let body: Partial<AgentMailMessage>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  if (!body.message_id || (!body.text && !body.html)) {
    return c.json({ error: "message_id and a body are required" }, 400);
  }

  // the whitelist check comes after shape validation but before she acts:
  // a forwarded invite from a stranger is not a meeting she joins.
  if (!senderWhitelisted(body.from as string | undefined)) {
    console.warn(`prixie: inbound mail from unwhitelisted sender rejected: ${body.from}`);
    return c.json({ error: "sender not whitelisted" }, 403);
  }

  const result = await agentMailInbound({
    message_id: body.message_id,
    from: body.from || "unknown@unknown",
    subject: body.subject || "",
    text: body.text,
    html: body.html,
    date: body.date,
  });

  return c.json(result, result.created ? 201 : 422);
});

// a get for the provider to verify the door exists.
agentMailRouter.get("/status", (c) =>
  c.json({
    inbox: "prixie",
    listening: Deno.env.get("AGENTMAIL_WEBHOOK_SECRET") ? true : false,
    note: "set AGENTMAIL_WEBHOOK_SECRET and PRIXIE_FORWARD_WHITELIST to open the inbox; only whitelisted senders' forwards are join requests",
  }));

export { agentMailRouter };
