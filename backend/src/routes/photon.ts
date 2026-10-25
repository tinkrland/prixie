// the photon webhook: her imessage front door.
//
// spectrum POSTs every inbound imessage here, hmac-signed (v0 scheme,
// 5 minute freshness). the signature is verified against the RAW body
// before parsing: a message that fails the gate is not read at all.
// then the whitelist, then photonInbound, then the meeting manager
// deploys her. same contract as the agentmail door: unset secret or
// unset whitelist = the door stays closed, never open by default.

import { Hono } from "hono";
import {
  photonConfigured,
  photonInbound,
  photonReply,
  photonSenderWhitelisted,
  photonWhitelistedSender,
  verifyPhotonSignature,
  type PhotonPayload,
} from "../services/photon.ts";

const photonRouter = new Hono();

photonRouter.post("/webhook", async (c) => {
  const secret = Deno.env.get("PHOTON_SIGNING_SECRET");
  // unset secret = route closed, not open. set the env to open the door.
  if (!secret) return c.json({ error: "unauthorized" }, 401);

  const rawBody = await c.req.text();
  const ok = await verifyPhotonSignature(
    rawBody,
    c.req.header("x-spectrum-signature"),
    c.req.header("x-spectrum-timestamp"),
    secret,
  );
  if (!ok) {
    return c.json({ error: "bad signature" }, 401);
  }

  let payload: PhotonPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  // the whitelist check comes after the gate but before she acts: a
  // text from a stranger is not a meeting she joins.
  const sender = photonWhitelistedSender(payload);
  if (!sender) {
    console.warn(
      `prixie: inbound imessage from unwhelisted sender rejected: ${payload.message?.sender?.id}`,
    );
    return c.json({ error: "sender not whitelisted" }, 403);
  }

  const result = await photonInbound(payload);

  // the relay back rides the same conversation, only for her: a
  // receipt she can read at a glance. failure to relay never fails
  // the join: the meeting is already created.
  if (result.created) {
    void photonReply(sender, `on my way: ${result.reason} (${result.join_url})`).catch(() => {});
  } else if (result.reason.includes("blocked by safety gate")) {
    void photonReply(sender, `i did not join: ${result.reason}`).catch(() => {});
  }

  return c.json(result, result.created ? 201 : 422);
});

// a get for the provider to verify the door exists.
photonRouter.get("/status", (c) =>
  c.json({
    imessage: "prixie",
    listening: Boolean(Deno.env.get("PHOTON_SIGNING_SECRET")) && photonConfigured(),
    whitelist: Boolean(Deno.env.get("PRIXIE_PHOTON_WHITELIST")),
    note: "set PHOTON_SIGNING_SECRET (spectrum webhook secret) and PRIXIE_PHOTON_WHITELIST (e.164 numbers, the owner's) to open the door; PHOTON_PROJECT_ID + PHOTON_PROJECT_SECRET for the relay back",
  }));

export { photonRouter };
