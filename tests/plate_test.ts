// the plate is a render of 3d files, through the pinned camera, lit by the
// recipe. run: deno test tests/plate_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { buildPlateSpec, renderPlateCmd } from "../server/plate.ts";
import { defaultSet, LIGHT_RECIPES } from "../server/set.ts";
import { streamerRoom } from "../server/scene.ts";

Deno.test("the spec wires the recipe's three lights into the render", () => {
  const set = defaultSet();
  const spec = buildPlateSpec(set, streamerRoom().cam, { width: 1280, height: 720 }, "/tmp/p.png");
  const recipe = LIGHT_RECIPES[set.lighting];
  assertEquals(spec.lights.length, 3, "key, fill, rim");
  assertEquals(spec.lights[0].azimuth, recipe.key.azimuth);
  assertEquals(spec.lights[0].intensity, recipe.key.intensity);
  assertEquals(spec.ambient, 0.45, "bright ambience maps to its floor");
});

Deno.test("the spec carries the pinned camera unchanged", () => {
  const spec = buildPlateSpec(defaultSet(), streamerRoom().cam, { width: 1280, height: 720 }, "/tmp/p.png");
  assertEquals(spec.camera.position, [0, 1.35, 1.9]);
  assertEquals(spec.camera.lookAt, [0, 1.35, 0]);
  assertEquals(spec.camera.fov, 32);
});

Deno.test("the white studio is a 3d file and the cmd runs the renderer", () => {
  const spec = buildPlateSpec(
    { ...defaultSet(), name: "prixie white studio" },
    streamerRoom().cam,
    { width: 1280, height: 720 },
    "/tmp/white.png",
  );
  assertEquals(spec.set, "assets/sets/white_studio.glb", "the white background render comes from the white cyc 3d file");
  assertEquals(renderPlateCmd("/tmp/spec.json"), ["python3", "scripts/render_plate.py", "/tmp/spec.json"]);
});
