// flowing-form tests: the pure planner and the url detector. the
// browser loop is the same precedence, exercised through the seams.

import { assertEquals } from "jsr:@std/assert@1";
import { flowActionFor, isFlowingForm } from "./form_entry.ts";
import { isZoomRegisterUrl } from "./browserbase.ts";

Deno.test("isFlowingForm knows the one-screen-at-a-time engines", () => {
  assertEquals(isFlowingForm("https://form.typeform.com/to/abc123"), true);
  assertEquals(isFlowingForm("https://xyz123.typeform.com/to/abc123"), true);
  assertEquals(isFlowingForm("https://www.surveymonkey.com/r/abc"), true);
  // single-page engines stay on the single-page path
  assertEquals(isFlowingForm("https://docs.google.com/forms/d/abc/viewform"), false);
  assertEquals(isFlowingForm("https://tally.so/r/3qDpEY"), false);
  assertEquals(isFlowingForm("not a url"), false);
});

Deno.test("flowActionFor: submit-shaped wins, next-shaped advances, neither stops", () => {
  // a screen with both is the last screen
  assertEquals(flowActionFor(["next", "submit"]).act, "submit");
  assertEquals(flowActionFor(["submit response"]).act, "submit");
  assertEquals(flowActionFor(["done"]).act, "submit");
  assertEquals(flowActionFor(["next"]).act, "advance");
  // typeform's arrow button carries its label in aria-label
  assertEquals(flowActionFor(["next"]).act, "advance");
  assertEquals(flowActionFor(["continue"]).act, "advance");
  assertEquals(flowActionFor(["ok"]).act, "advance");
  // a screen with neither is where the truth stops
  assertEquals(flowActionFor(["back", "cancel", ""]).act, "stuck");
});

Deno.test("isZoomRegisterUrl: register-shaped links are signups, /j/ links are joins", () => {
  assertEquals(isZoomRegisterUrl("https://us05web.zoom.us/meeting/register/abc123"), true);
  assertEquals(isZoomRegisterUrl("https://company.zoom.us/webinar/register/WN_xyz"), true);
  assertEquals(isZoomRegisterUrl("https://zoom.us/j/123456789?pwd=abc"), false);
  assertEquals(isZoomRegisterUrl("https://company.zoom.us/j/1234567890"), false);
  assertEquals(isZoomRegisterUrl("https://tally.so/r/3qDpEY"), false);
});
