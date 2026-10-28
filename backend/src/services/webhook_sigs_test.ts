// webhook signature helpers + the shared mail sender whitelist.
// vectors precomputed independently (python hmac), so the math is
// pinned against the actual schemes the providers document.

import { assertEquals } from "jsr:@std/assert@1";
import {
  base64Decode,
  constantTimeEqual,
  freshUnixSeconds,
  hmacSha256Base64,
  hmacSha256Base64KeyBytes,
  hmacSha256Hex,
} from "./webhook_sigs.ts";
import { mailSenderWhitelisted } from "./mail_whitelist.ts";

Deno.test("hmac-sha256 hex: the dearagent scheme, pinned against python", async () => {
  // python: hmac.new(b"test-secret", msg, sha256).hexdigest()
  assertEquals(
    await hmacSha256Hex("test-secret", '1785640000.{"type":"message.received"}'),
    "16a85a5a1e926a938f628bbcec863cdd6b27616a674e4dfc1b4088aef9109c58",
  );
});

Deno.test("hmac-sha256 base64 + key-bytes: the svix scheme, pinned against python", async () => {
  // plain-string key: base64 is the same digest, encoded differently
  const hex = await hmacSha256Hex("test-secret", "abc");
  assertEquals(
    await hmacSha256Base64("test-secret", "abc"),
    btoa(String.fromCharCode(...hex.match(/../g)!.map((b) => parseInt(b, 16)))),
  );
  // svix: whsec_ base64 secret, key = DECODED bytes
  const whsec = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
  const key = base64Decode(whsec);
  assertEquals(
    await hmacSha256Base64KeyBytes(key, "evt_abc.1785640000.body bytes here"),
    "uQTGKhbzprQOxnGHtCgpkSXlgQiV7WnzQTdSOT9L0v4=",
  );
});

Deno.test("constant time compare: equal yes, unequal no, length mismatch no", () => {
  assertEquals(constantTimeEqual("aabb", "aabb"), true);
  assertEquals(constantTimeEqual("aabb", "aabc"), false);
  assertEquals(constantTimeEqual("aab", "aabb"), false);
  assertEquals(constantTimeEqual("", ""), true);
});

Deno.test("freshness: unix seconds inside the window pass, stale and garbage die", () => {
  const now = String(Math.floor(Date.now() / 1000));
  assertEquals(freshUnixSeconds(now), true);
  assertEquals(freshUnixSeconds(String(Number(now) - 299)), true);
  assertEquals(freshUnixSeconds(String(Number(now) - 301)), false);
  assertEquals(freshUnixSeconds(undefined), false);
  assertEquals(freshUnixSeconds("not-a-number"), false);
});

Deno.test("mail sender whitelist: one config, both spellings, closed when unset", () => {
  Deno.env.set("PRIXIE_MAIL_SENDER_WHITELIST", "priya@example.com, other@example.org");
  Deno.env.delete("PRIXIE_FORWARD_WHITELIST");
  try {
    assertEquals(mailSenderWhitelisted("priya@example.com"), true);
    assertEquals(mailSenderWhitelisted("Priya <priya@example.com>"), true);
    assertEquals(mailSenderWhitelisted("stranger@example.com"), false);
    assertEquals(mailSenderWhitelisted(undefined), false);
  } finally {
    Deno.env.delete("PRIXIE_MAIL_SENDER_WHITELIST");
  }

  // the forward spelling still feeds the true-inbox providers: the
  // owner configures senders once
  Deno.env.set("PRIXIE_FORWARD_WHITELIST", "priya@example.com");
  try {
    assertEquals(mailSenderWhitelisted("priya@example.com"), true);
    assertEquals(mailSenderWhitelisted("stranger@example.com"), false);
  } finally {
    Deno.env.delete("PRIXIE_FORWARD_WHITELIST");
  }

  // unset = the door stays closed
  assertEquals(mailSenderWhitelisted("priya@example.com"), false);
});
