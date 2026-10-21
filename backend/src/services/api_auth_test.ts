// api auth tests: the door is closed by default, the token is checked
// constant-time, and the header shapes both work.

import { assertEquals } from "jsr:@std/assert@1";
import { tokenFromHeaders, tokensMatch } from "./api_auth.ts";

const headers = (obj: Record<string, string>) => {
  const m = new Map(Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (n: string) => m.get(n.toLowerCase()) ?? null };
};

Deno.test("bearer and x-api-token both work", () => {
  assertEquals(tokenFromHeaders(headers({ "Authorization": "Bearer abc123" })), "abc123");
  assertEquals(tokenFromHeaders(headers({ "authorization": "bearer abc123" })), "abc123");
  assertEquals(tokenFromHeaders(headers({ "x-api-token": "abc123" })), "abc123");
  assertEquals(tokenFromHeaders(headers({})), null);
});

Deno.test("a wrong or empty token is rejected, never half-matched", () => {
  assertEquals(tokensMatch("secret-token", "secret-token"), true);
  assertEquals(tokensMatch("secret-token", "secret-tokens"), false);
  assertEquals(tokensMatch("secret-token", ""), false);
  assertEquals(tokensMatch("secret-token", "secret"), false);
});
