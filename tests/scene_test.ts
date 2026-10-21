// the camera render: projection from the room, person foreground,
// environment all background. run: deno test tests/scene_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { projectPlacement, projectPoint, streamerRoom } from "../studioify/scene.ts";

const frame = { width: 1280, height: 720 };

Deno.test("the projection is a pinhole: halving the distance doubles her size", () => {
  const { cam, person } = streamerRoom();
  const near = projectPlacement(cam, { ...person, floor: { x: 0, y: 0, z: 0 } }, frame);
  // the camera looks toward -z: depth 3.8 means z = -1.9, not behind the lens
  const far = projectPlacement(cam, { ...person, floor: { x: 0, y: 0, z: -1.9 } }, frame);
  assertEquals(near.distance, 1.9);
  assertEquals(far.distance, 3.8);
  // ratio of sizes equals inverse ratio of distances, within rounding
  assertEquals(Math.abs(near.fitHeight / far.fitHeight - 2) < 0.01, true);
});

Deno.test("off the camera axis, she lands off centre", () => {
  const { cam, person } = streamerRoom();
  const left = projectPlacement(cam, { ...person, floor: { x: -0.5, y: 0, z: 0 } }, frame);
  const right = projectPlacement(cam, { ...person, floor: { x: 0.5, y: 0, z: 0 } }, frame);
  assertEquals(left.anchorX < 0.5, true, "she lands left of centre");
  assertEquals(right.anchorX > 0.5, true, "she lands right of centre");
  assertEquals(Math.abs(left.fitHeight - right.fitHeight) < 0.001, true,
    "same depth, same size: lateral position does not change her scale");
});

Deno.test("the projected rect matches a hand-computed pinhole", () => {
  // camera at origin height 1.35 looking straight down -z at her face:
  // focal = 360 / tan(16 deg) = 1256.5; her head top 1.68 is 0.33m above the
  // axis at 1.9m depth; her bust bottom 1.0 is 0.35m below
  const { cam, person } = streamerRoom();
  const p = projectPlacement(cam, person, frame);
  const focal = 360 / Math.tan((32 * Math.PI / 180) / 2);
  const headPx = 360 - (focal * 0.33) / 1.9;
  const bustPx = 360 + (focal * 0.35) / 1.9;
  assertEquals(Math.abs(p.anchorY * frame.height - headPx) < 1, true, "head top where the lens says");
  assertEquals(Math.abs(p.fitHeight * frame.height - (bustPx - headPx)) < 1, true, "bust height where the lens says");
  assertEquals(p.anchorX, 0.5, "dead centre: the lens is pinned at her");
});

Deno.test("ground contact: the floor meets her at the projected ground point", () => {
  const { cam, person } = streamerRoom();
  const p = projectPlacement(cam, person, frame);
  // the floor is BELOW the bust crop's bottom (she reads as standing at depth)
  assertEquals(p.groundY * frame.height > (p.anchorY + p.fitHeight) * frame.height, true,
    "the projected floor sits below the visible bust");
  const fullFigure = projectPlacement(
    cam,
    { ...person, visibleBottom: 0 },
    frame,
  );
  // with feet visible, the rect's bottom IS the floor contact
  assertEquals(
    Math.abs(fullFigure.groundY - (fullFigure.anchorY + fullFigure.fitHeight)) < 0.002,
    true,
    "full figure: the rect lands on the floor",
  );
});

Deno.test("the streamer room reads like a webcam: bust large in frame, room behind", () => {
  const { cam, person } = streamerRoom();
  const p = projectPlacement(cam, person, frame);
  assertEquals(p.fitHeight > 0.5, true, "she is the foreground subject, not a sticker");
  assertEquals(p.anchorY < 0.25, true, "her head sits high in frame like a webcam");
});
