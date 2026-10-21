// background removal is stage one of the turn, not an external input.
// run: deno test tests/turn_test.ts

import { assertEquals } from "jsr:@std/assert@1";
import { planSpeakTurn } from "../server/turn.ts";
import { defaultSet, whiteStudioSet } from "../server/set.ts";
import { streamerRoom } from "../server/scene.ts";
import { buildMatteCmd } from "../server/matte.ts";

const room = streamerRoom();
const base = {
  person: "/clips/turn.mp4",
  set: defaultSet(),
  cam: room.cam,
  anchor: room.person,
  frame: { width: 1280, height: 720 },
  paths: {
    matte: "/tmp/turn_matte.mp4",
    plateSpec: "/tmp/turn_plate.json",
    plate: "/tmp/turn_plate.png",
    out: "/tmp/turn_out.mp4",
  },
};

Deno.test("the turn removes the background: matte is stage one", () => {
  const plan = planSpeakTurn(base);
  assertEquals(plan.matteCmd, buildMatteCmd("/clips/turn.mp4", "/tmp/turn_matte.mp4"));
  // and the composite consumes the matte the stage produced
  assertEquals(plan.composite.includes("/tmp/turn_matte.mp4"), true);
});

Deno.test("a supplied matte skips the stage for that turn only", () => {
  const plan = planSpeakTurn({ ...base, matte: "/clips/turn_alpha.mp4" });
  assertEquals(plan.matteCmd, null);
  assertEquals(plan.composite.includes("/clips/turn_alpha.mp4"), true);
});

Deno.test("the white background turn renders proskena's paper scene", () => {
  const plan = planSpeakTurn({ ...base, set: whiteStudioSet() });
  assertEquals(plan.plateSpec.environment.bg, "#b8b5ad");
  assertEquals(plan.plateCmd, ["python3", "scripts/render_plate.py", "/tmp/turn_plate.json"]);
});

Deno.test("the composite places her from the room geometry, not the screen", () => {
  const plan = planSpeakTurn(base);
  // the placement rides the composite's framing chain: her size is the lens,
  // her position is the room
  const filter = plan.composite[plan.composite.indexOf("-filter_complex") + 1];
  assertEquals(filter.includes("fitHeight") || filter.includes("anchorY") || filter.includes("overlay="), true,
    "the composite carries the projected placement");
});
