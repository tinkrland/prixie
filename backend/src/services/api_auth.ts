// api auth (the owner, oct 21 2026): the server was open. browserbase is a
// CLIENT of this server, not a shield for it - anyone who finds the url
// could create meetings, read captures, trigger deploys, while the db
// client holds the service role key. the rule of this repo, applied
// where it always should have been:
//
//   PRIXIE_API_TOKEN set   -> every /api route requires it
//                             (Authorization: Bearer <t> or x-api-token)
//   PRIXIE_API_TOKEN unset -> the /api door is CLOSED (503), because
//                             "unset = closed" is the house rule, same
//                             as the agentmail secret and the forward
//                             whitelist. the health route stays open
//                             so uptime checks still work.
//
// webhooks are exempt: they carry their own secrets (agentmail's
// x-agentmail-secret, realtime's x-realtime-secret added with this
// change). the service role key stays in the db client, which is fine
// once the server itself is gated - service role is server-side power
// and the server is the thing being locked here.
//
// the token compare is constant-time: a timing oracle on a single-user
// api token is a small thing, but small things are cheap to do right.

let warnedNoToken = false;

export function tokenFromHeaders(
  headers: { get(name: string): string | null },
): string | null {
  const auth = headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const xToken = headers.get("x-api-token");
  if (xToken) return xToken.trim();
  return null;
}

// constant-time compare: same length requirement leaks only length,
// which the attacker already knows from sending the token.
export function tokensMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

import { Hono } from "hono";
import type { Context, Next } from "hono";

// the middleware. applies to /api/* only; webhooks and health mount
// outside it.
export async function requireApiToken(c: Context, next: Next) {
  const expected = Deno.env.get("PRIXIE_API_TOKEN");

  if (!expected) {
    if (!warnedNoToken) {
      console.warn(
        "prixie: PRIXIE_API_TOKEN is not set, the /api door is CLOSED. set it to open the server.",
      );
      warnedNoToken = true;
    }
    return c.json(
      { error: "server not configured: set PRIXIE_API_TOKEN on the server" },
      503,
    );
  }

  const provided = tokenFromHeaders(c.req.raw.headers);
  if (!provided || !tokensMatch(expected, provided)) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
}
