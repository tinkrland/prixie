// long form and the streamer republish: sizing, the cam box, the screen
// composite. run: deno test tests/screen_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { buildScreenCompositeArgs, type ScreenPlan } from "../server/composite.ts";
import { camBubble } from "../server/overlay.ts";
import { defaultSet, gradeFromLighting, LIGHT_RECIPES, placementForShot } from "../server/set.ts";
import { LONGFORM_TARGETS, target } from "../server/sizes.ts";

Deno.test("long form: youtube and twitch targets, sourced 2026-10-21", () => {
  assertEquals(LONGFORM_TARGETS.youtube_long.width, 1920);
  assertEquals(LONGFORM_TARGETS.youtube_long.height, 1080);
  assertEquals(LONGFORM_TARGETS.youtube_4k.width, 3840);
  assertEquals(LONGFORM_TARGETS.shorts.height, 1920, "shorts are 9:16");
  assertEquals(LONGFORM_TARGETS.twitch_vod.height, 1080, "vods inherit the broadcast frame");
  assertEquals(LONGFORM_TARGETS.youtube_long.safeBottom, 0.1, "burned captions own the bottom tenth");
  assertEquals(LONGFORM_TARGETS.shorts.safeTop, 0.14, "same ui bands as reels and tiktok");
  assertEquals(target("youtube_long").surface, "longform");
  assertEquals(target("thumbnail").width, 3840, "2026 thumbnail guidance");
});

Deno.test("the cam box clears the caption band on long form", () => {
  const t = target("youtube_long");
  const bl = camBubble(t, { corner: "bl" });
  const boxBottom = bl.y + bl.height;
  const captionBandTop = t.height - t.height * t.safeBottom;
  assertEquals(boxBottom <= captionBandTop, true,
    `box bottom ${boxBottom} must sit above the caption band ${captionBandTop}`);
  assertEquals(bl.x > 0 && bl.x < t.width * 0.5, true, "bottom-left is inside the left half");
  assertEquals(bl.width % 2 === 0 && bl.height % 2 === 0, true, "even dims for the encoder");
});

Deno.test("the cam box clears the ui band on verticals", () => {
  const v = target("shorts");
  const br = camBubble(v, { corner: "br" });
  assertEquals(br.y + br.height <= v.height - v.height * v.safeBottom, true, "clear of the bottom band");
  assertEquals(br.y >= v.height * v.safeTop, true, "clear of the top band");
});

Deno.test("the box is a mini composite: proskena lens at box scale, room behind her", () => {
  const set = defaultSet();
  const t = target("youtube_long");
  const bubble = camBubble(t, { corner: "bl" });
  const plan: ScreenPlan = {
    screen: "screen.mp4",
    person: "person.mp4",
    matte: "matte.mp4",
    plate: "room.png",
    out: "out.mp4",
    grade: gradeFromLighting(LIGHT_RECIPES[set.lighting]),
    placement: placementForShot(set.shot),
    bubble,
    width: t.width,
    height: t.height,
  };
  const args = buildScreenCompositeArgs(plan);
  const graph = args[args.indexOf("-filter_complex") + 1] as string;
  // the box frame is the bubble: the person and matte are framed at box size
  const boxH = Math.round(plan.placement!.fitHeight * bubble.height);
  const boxTop = Math.round(plan.placement!.anchorY * bubble.height);
  assertEquals(graph.includes(`scale=-1:${boxH}`), true, "the lens sizes her within the box");
  assertEquals(graph.includes(`pad=${bubble.width}:${bubble.height}:(ow-iw)/2:${boxTop}`), true,
    "she is anchored inside the box, not the frame");
  // the room plate is framed at box size too, not the frame
  assertEquals(graph.includes(`scale=${bubble.width}:${bubble.height}:force_original_aspect_ratio=increase`),
    true, "the room plate fills the box");
  // the box lands at the bubble rect on the base
  assertEquals(graph.includes(`overlay=${bubble.x}:${bubble.y}`), true, "the box overlays the screen at its rect");
  // the screen is the base, cover-cropped
  assertEquals(graph.includes(`[0:v]scale=1920:1080:force_original_aspect_ratio=increase`), true);
  // the grade rides the person inside the box
  const temp = plan.grade!.temperature ?? 0;
  assertEquals(graph.includes(`colorchannelmixer=rr=${(1 + temp * 0.12).toFixed(3)}`), true,
    "gradeFromLighting applies inside the box");
});

Deno.test("no matte: the key path still frames the box", () => {
  const t = target("youtube_long");
  const bubble = camBubble(t, { corner: "br" });
  const args = buildScreenCompositeArgs({
    screen: "screen.mp4",
    person: "person.mp4",
    plate: "room.png",
    out: "out.mp4",
    bubble,
    width: t.width,
    height: t.height,
  });
  const graph = args[args.indexOf("-filter_complex") + 1] as string;
  assertEquals(graph.includes("[2:v]scale=") === false || graph.includes("format=gray") === false, true,
    "no matte chain without a matte");
  assertEquals(graph.includes(`overlay=${bubble.x}:${bubble.y}`), true);
});
