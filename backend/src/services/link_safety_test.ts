// link safety gate tests: she only ever opens http(s) to a real domain,
// and the gate fails closed.

import { assertEquals } from "jsr:@std/assert@1";
import { localLinkVerdict } from "./link_safety.ts";

Deno.test("plain https links pass", () => {
  assertEquals(localLinkVerdict("https://zoom.us/j/123?pwd=abc").safe, true);
  assertEquals(localLinkVerdict("http://example.com/form").safe, true);
});

Deno.test("scheme tricks are blocked", () => {
  assertEquals(localLinkVerdict("javascript:alert(1)").safe, false);
  assertEquals(localLinkVerdict("data:text/html,hi").safe, false);
});

Deno.test("credential lures are blocked", () => {
  assertEquals(localLinkVerdict("https://zoom.us@evil.example/login").safe, false);
});

Deno.test("raw and local hosts are blocked", () => {
  assertEquals(localLinkVerdict("http://192.168.1.1/admin").safe, false);
  assertEquals(localLinkVerdict("http://localhost:3000/x").safe, false);
  assertEquals(localLinkVerdict("http://10.0.0.5:8080/").safe, false);
});

Deno.test("punycode homoglyphs are blocked", () => {
  assertEquals(localLinkVerdict("https://xn--pypal-4ve.example/login").safe, false);
});

Deno.test("exotic ports are blocked", () => {
  assertEquals(localLinkVerdict("https://example.com:8443/x").safe, false);
});

Deno.test("garbage is blocked, not crashed", () => {
  assertEquals(localLinkVerdict("").safe, false);
  assertEquals(localLinkVerdict("not a url at all").safe, false);
});
