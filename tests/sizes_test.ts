// the socmed sizing, sourced from proskena. run: deno test tests/sizes_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { captureTarget, placementInSafeZone, SOCIAL_TARGETS, target } from "../server/sizes.ts";
import { placementForShot, defaultSet } from "../server/set.ts";

Deno.test("presets mirror proskena's export sizes, verbatim", () => {
  assertEquals(SOCIAL_TARGETS.square, { ...SOCIAL_TARGETS.square, width: 1080, height: 1080 });
  assertEquals(SOCIAL_TARGETS.portrait.width, 1080);
  assertEquals(SOCIAL_TARGETS.portrait.height, 1350);
  assertEquals(SOCIAL_TARGETS.vertical.width, 1080);
  assertEquals(SOCIAL_TARGETS.vertical.height, 1920);
  assertEquals(SOCIAL_TARGETS.wide.width, 1920);
  assertEquals(SOCIAL_TARGETS.wide.height, 1080);
  // proskena's platform-reference: 9:16 keeps ~14 percent ui bands
  assertEquals(SOCIAL_TARGETS.vertical.safeTop, 0.14);
  assertEquals(SOCIAL_TARGETS.vertical.safeBottom, 0.14);
  // the call target stays the video branch's default framing
  assertEquals(SOCIAL_TARGETS.call.width, 1280);
  assertEquals(SOCIAL_TARGETS.call.height, 720);
});

Deno.test("unknown targets refuse rather than guess", () => {
  let threw = false;
  try {
    target("myspace");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "an unknown target throws");
});

Deno.test("the 9:16 safe zone moves the framing, other ratios do not", () => {
  const set = defaultSet(); // 50mm medium portrait: fitHeight 0.78, anchorY 0.08
  const placement = placementForShot(set.shot);
  const vertical = captureTarget("vertical", placement);
  assertEquals(vertical.safe, true, "the vertical crop clamps to the ui bands");
  assertEquals(vertical.rendered.width, 1080);
  // her head clears the top 14 percent band
  assertEquals(placementInSafeZone(placement, vertical.rendered).anchorY >= 0.14, true);
  const portrait = captureTarget("portrait", placement);
  assertEquals(portrait.safe, false, "a 4:5 feed post is the lens's framing, untouched");
  const call = captureTarget("call", placement);
  assertEquals(call.safe, false, "the call target never has bands");
});

Deno.test("she still fits between the bands on a vertical", () => {
  const close = placementForShot({ fov: 15, focallength: 105, focaldistance: 180 }); // close portrait, fills the frame
  const vertical = placementInSafeZone(close, SOCIAL_TARGETS.vertical);
  assertEquals(vertical.fitHeight <= 0.72, true, "the close portrait shrinks to the usable 72 percent");
  assertEquals(vertical.anchorY, 0.14, "anchored below the top band");
});
