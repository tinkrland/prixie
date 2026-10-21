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
    note: "set AGENTMAIL_WEBHOOK_SECRET to open the inbox; forward a meeting invite to her address and she joins",
  }));

export { agentMailRouter };
