// photon tests: the pure half of the imessage front door. the
// signature gate is the contract (a message that fails it is never
// read), the whitelist is the join request, and the relay rule is
// structural: the reply refuses anyone outside the whitelist, ever.

import { assertEquals } from "jsr:@std/assert@1";
import { createHmac } from "node:crypto";
import {
  photonInbound,
  photonMessageText,
  photonSenderWhitelisted,
  photonWhitelistedSender,
  photonReply,
  verifyPhotonSignature,
  type PhotonPayload,
} from "./photon.ts";

const SECRET = "whsec_test_1234";

function signed(body: string, ts: string): { sig: string; ts: string } {
  const sig =
    "v0=" + createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex");
  return { sig, ts };
}

Deno.test("a genuine signed delivery verifies", async () => {
  const body = JSON.stringify({ event: "messages" });
  const now = String(Math.floor(Date.now() / 1000));
  const { sig, ts } = signed(body, now);
  assertEquals(await verifyPhotonSignature(body, sig, ts, SECRET), true);
});

Deno.test("tampering, replays, and garbage all fail the gate", async () => {
  const body = JSON.stringify({ event: "messages" });
  const now = String(Math.floor(Date.now() / 1000));
  const { sig, ts } = signed(body, now);
  // tampered body
  assertEquals(await verifyPhotonSignature(body + " ", sig, ts, SECRET), false);
  // replay: older than 5 minutes
  const stale = String(Math.floor(Date.now() / 1000) - 301);
  const staleSig = signed(body, stale);
  assertEquals(await verifyPhotonSignature(body, staleSig.sig, stale, SECRET), false);
  // wrong secret
  assertEquals(await verifyPhotonSignature(body, sig, ts, "other"), false);
  // missing headers
  assertEquals(await verifyPhotonSignature(body, undefined, ts, SECRET), false);
  assertEquals(await verifyPhotonSignature(body, sig, undefined, SECRET), false);
});

Deno.test("whitelist: exact ids only, unset stays closed", () => {
  Deno.env.set("PRIXIE_PHOTON_WHITELIST", "+15550001111, priya@icloud.com");
  try {
    assertEquals(photonSenderWhitelisted("+15550001111"), true);
    assertEquals(photonSenderWhitelisted("+15550001112"), false);
    // email-addressed imessage is a first-class sender id
    assertEquals(photonSenderWhitelisted("priya@icloud.com"), true);
    assertEquals(photonSenderWhitelisted("priya@icloud.com"), true);
    assertEquals(photonSenderWhitelisted("stranger@icloud.com"), false);
    assertEquals(photonSenderWhitelisted(undefined), false);
  } finally {
    Deno.env.delete("PRIXIE_PHOTON_WHITELIST");
  }
  // unset = the door stays closed
  assertEquals(photonSenderWhitelisted("+15550001111"), false);
});

Deno.test("text extraction: only message events with text content count", () => {
  const text: PhotonPayload = {
    event: "messages",
    message: { sender: { id: "+15550001111" }, content: { type: "text", text: "join this https://zoom.us/j/123?pwd=abc" } },
  };
  assertEquals(photonMessageText(text), "join this https://zoom.us/j/123?pwd=abc");
  const reaction: PhotonPayload = {
    event: "messages",
    message: { sender: { id: "+15550001111" }, content: { type: "reaction" } },
  };
  assertEquals(photonMessageText(reaction), null);
  const other: PhotonPayload = {
    event: "something_else",
    message: { content: { type: "text", text: "hi" } },
  };
  assertEquals(photonMessageText(other), null);
});

Deno.test("the relay rule is structural: the reply refuses strangers", async () => {
  Deno.env.set("PRIXIE_PHOTON_WHITELIST", "+15550001111");
  try {
    // a stranger never gets a reply, no matter what creds exist
    assertEquals(await photonReply("+15559999999", "hi"), false);
    // and an unconfigured sender fails closed for the owner too: never
    // a partial path that pretends it sent
    Deno.env.delete("PHOTON_PROJECT_ID");
    assertEquals(await photonReply("+15550001111", "hi"), false);
  } finally {
    Deno.env.delete("PRIXIE_PHOTON_WHITELIST");
  }
});

Deno.test("the whitelisted sender is surfaced for the relay, strangers are not", () => {
  Deno.env.set("PRIXIE_PHOTON_WHITELIST", "+15550001111");
  try {
    const p: PhotonPayload = {
      event: "messages",
      message: { sender: { id: "+15550001111" }, content: { type: "text", text: "hi" } },
    };
    assertEquals(photonWhitelistedSender(p), "+15550001111");
    p.message!.sender!.id = "+15559999999";
    assertEquals(photonWhitelistedSender(p), null);
  } finally {
    Deno.env.delete("PRIXIE_PHOTON_WHITELIST");
  }
});

Deno.test("inbound: a text with no link is honestly refused, not guessed", async () => {
  const p: PhotonPayload = {
    event: "messages",
    message: { sender: { id: "+15550001111" }, content: { type: "text", text: "hey can you believe the weather" } },
  };
  const r = await photonInbound(p);
  assertEquals(r.created, false);
  assertEquals(r.reason.includes("no meeting link"), true);
});

Deno.test("inbound: an attachment is not a join request", async () => {
  const p: PhotonPayload = {
    event: "messages",
    message: { sender: { id: "+15550001111" }, content: { type: "attachment" } },
  };
  const r = await photonInbound(p);
  assertEquals(r.created, false);
  assertEquals(r.reason.includes("no text"), true);
});
