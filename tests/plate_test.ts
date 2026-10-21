// the plate is a proskena scene state: the 3d system that exists. run:
// deno test tests/plate_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { buildPlateSpec, renderPlateCmd } from "../server/plate.ts";
import { defaultSet, whiteStudioSet, LIGHT_RECIPES, PROSKENA_BACKDROPS, PERSON_STAGE_SCALE } from "../server/set.ts";
import { streamerRoom } from "../server/scene.ts";

const frame = { width: 1280, height: 720 };

Deno.test("the spec is proskena's scene state schema", () => {
  const spec = buildPlateSpec(defaultSet(), streamerRoom().cam, frame, "/tmp/p.png");
  assertEquals(spec.schema, "proskena-scene-state");
  assertEquals(spec.sceneScale, PERSON_STAGE_SCALE);
  assertEquals(spec.subject, null, "the person replaces the subject on prixie's stage");
  assertEquals(spec.lighting.key.azimuth, LIGHT_RECIPES.soft_studio.key.azimuth);
  assertEquals(spec.lighting.ambience, LIGHT_RECIPES.soft_studio.ambience);
  assertEquals(spec.props.length, 3, "props placed as scene objects, proskena's way");
});

Deno.test("the camera arrives in proskena units, at person scale", () => {
  const spec = buildPlateSpec(defaultSet(), streamerRoom().cam, frame, "/tmp/p.png");
  assertEquals(spec.live.position, [0, 1350, 1900]);
  assertEquals(spec.live.target, [0, 1350, 0]);
  assertEquals(spec.live.fov, 32);
});

Deno.test("the white background is proskena's paper preset", () => {
  const spec = buildPlateSpec(whiteStudioSet(), streamerRoom().cam, frame, "/tmp/p.png");
  assertEquals(spec.environment.bg, PROSKENA_BACKDROPS.paper.bg);
  assertEquals(spec.environment.center, PROSKENA_BACKDROPS.paper.center);
  assertEquals(spec.props, [], "the white studio is the paper backdrop alone");
  assertEquals(renderPlateCmd("/tmp/spec.json"), ["python3", "scripts/render_plate.py", "/tmp/spec.json"]);
});
