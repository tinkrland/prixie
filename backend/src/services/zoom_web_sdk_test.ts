// zoom web sdk tests: the join url parser, the signature math, and the
// plan. the signature is verified against the documented algorithm shape
// (header.payload.signature, all base64url), not against zoom's servers.

import { assert, assertEquals } from "jsr:@std/assert";
import {
  generateSdkSignature,
  parseZoomJoinUrl,
  zoomWebSdkJoinPlan,
} from "./zoom_web_sdk.ts";

Deno.test("a zoom join url parses to meeting number + passcode", () => {
  const parts = parseZoomJoinUrl("https://zoom.us/j/987654321?pwd=abc123");
  assertEquals(parts?.meetingNumber, "987654321");
  assertEquals(parts?.passcode, "abc123");
});

Deno.test("the bare zoom.us/j link shape parses too (the bug zoom invites ship)", () => {
  const parts = parseZoomJoinUrl("https://zoom.us/j/987654321");
  assertEquals(parts?.meetingNumber, "987654321");
  assertEquals(parts?.passcode, undefined);
});

Deno.test("non-zoom urls return null, not a guess", () => {
  assertEquals(parseZoomJoinUrl("https://meet.google.com/abc-defg-hij"), null);
  assertEquals(parseZoomJoinUrl("not a url at all"), null);
});

Deno.test("the signature is the documented header.payload.sig shape, base64url", async () => {
  const now = Date.parse("2026-10-21T20:00:00Z");
  const signature = await generateSdkSignature("987654321", 0, "sdk_key", "sdk_secret", now);

  const dots = signature.split(".").length;
  assertEquals(dots, 3, "header.payload.signature");

  const [header] = signature.split(".");
  const decoded = JSON.parse(atob(header.replace(/-/g, "+").replace(/_/g, "/")));
  assertEquals(decoded.alg, "HS256");
  assertEquals(decoded.typ, "JWT");

  // the same inputs must produce the same signature, and determinism is
  // the point: the page can re-verify what the backend signed.
  const again = await generateSdkSignature("987654321", 0, "sdk_key", "sdk_secret", now);
  assertEquals(signature, again);
});

Deno.test("the join plan carries the participant defaults: camera off, mic off, role 0", () => {
  const plan = zoomWebSdkJoinPlan("https://zoom.us/j/987654321?pwd=abc123", {
    pageBase: "https://prixie.ai/join-zoom",
  });

  assert(plan);
  assertEquals(plan.meetingNumber, "987654321");
  assertEquals(plan.passcode, "abc123");
  assertEquals(plan.role, 0);
  assertEquals(plan.cameraOff, true);
  assertEquals(plan.micOff, true);
  assert(plan.pageUrl.includes("mn=987654321"), "the plan's page is per-meeting");
  assert(plan.pageUrl.includes("pwd=abc123"));
});
