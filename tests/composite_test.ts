// the composite command builders: pure, so the filter graphs are testable
// without rendering anything. run:
//   deno test --allow-env --allow-net tests/composite_test.ts

import {
  buildAlphaExportArgs,
  buildCompositeArgs,
  plateArgs,
  type ChromaKey,
  type CompositePlan,
  type Grade,
  personLayerFilters,
} from "../server/composite.ts";
import { assertEquals } from "jsr:@std/assert@1";

const base: Omit<CompositePlan, "key" | "matte" | "grade"> = {
  person: "/tmp/person.mp4",
  plate: "/tmp/plate.png",
  out: "/tmp/out.mp4",
  width: 1280,
  height: 720,
};

Deno.test("a still plate loops, or the composite dies after one frame", () => {
  const args = buildCompositeArgs({ ...base });
  // exactly the bug found on the first real run: overlay's shortest=1 met a
  // one-frame plate and the 5s composite came out 0.03s long.
  assertEquals(args[0], "-y");
  assertEquals(args[1], "-loop");
  assertEquals(args[2], "1");
  assertEquals(args[3], "-i");
  assertEquals(args[4], "/tmp/plate.png");
  const graph = args[args.indexOf("-filter_complex") + 1];
  assertEquals(graph.includes("shortest=1"), true, "overlay ends at the person's length");
});

Deno.test("a video plate stream-loops instead", () => {
  const args = buildCompositeArgs({ ...base, plate: "/tmp/set_loop.mp4" });
  const i = args.indexOf("-stream_loop");
  assertEquals(args[i + 1], "-1");
  assertEquals(args[i + 3], "/tmp/set_loop.mp4");
  assertEquals(args.includes("-loop"), false, "the image2 loop flag is for stills only");
});

Deno.test("the matte route merges the matte into the person's alpha", () => {
  const args = buildCompositeArgs({ ...base, matte: "/tmp/matte.mp4" });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assertEquals(graph.includes("alphamerge"), true, "matte merges via alphamerge");
  assertEquals(graph.includes("colorkey"), false, "no key when a matte is given");
  assertEquals(graph.includes("format=gray"), true, "the matte arrives as grayscale");
});

Deno.test("the chroma route keys, despills and grades", () => {
  const key: ChromaKey = { color: "00b140", similarity: 0.2, blend: 0.1, despill: true };
  const args = buildCompositeArgs({ ...base, key });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assertEquals(graph.includes("colorkey=00b140:0.2:0.1"), true, "the sampled colour is keyed");
  assertEquals(graph.includes("despill"), true, "despill is not optional");
  assertEquals(graph.includes("alphamerge"), false);
});

Deno.test("the grade seats the person in the set's light", () => {
  const grade: Grade = { temperature: 0.15, saturation: 1.05, brightness: 0.05 };
  const filters = personLayerFilters({ ...base, grade });
  assertEquals(filters.includes("eq=brightness=0.05:saturation=1.05:gamma=1"), true);
  assertEquals(filters.includes("colorchannelmixer=rr=1.018:bb=0.982"), true, "warm push: red up, blue down");
  const cold = personLayerFilters({ ...base, grade: { temperature: -0.15 } });
  assertEquals(cold.includes("colorchannelmixer=rr=0.982:bb=1.018"), true, "cool push inverts");
});

Deno.test("the plate covers the frame and the person pads transparent", () => {
  const filters = personLayerFilters(base);
  assertEquals(filters.includes("force_original_aspect_ratio=decrease"), true, "person fits inside");
  assertEquals(filters.includes("color=black@0"), true, "padding is transparent, not black bars");
  const args = buildCompositeArgs({ ...base });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assertEquals(graph.includes("force_original_aspect_ratio=increase"), true, "plate covers, never letterboxes");
  assertEquals(graph.includes("format=yuv420p[v]"), true, "output is the camera-track format");
});

Deno.test("the alpha export keeps the transparent path for the browser", () => {
  const key: ChromaKey = { color: "00b140", similarity: 0.2, blend: 0.1, despill: false };
  const args = buildAlphaExportArgs({ ...base, key, out: "/tmp/person.webm" });
  const vf = args[args.indexOf("-vf") + 1];
  assertEquals(vf.includes("format=yuva420p"), true, "alpha pixel format");
  assertEquals(args.includes("libvpx-vp9"), true);
  assertEquals(args.includes("-auto-alt-ref"), true, "vp9 needs auto-alt-ref off for alpha");
});

Deno.test("the flat fallback plate renders the set's two values", () => {
  const args = plateArgs({ width: 1280, height: 720, backdrop: { bg: "#e8e2d8", center: "#f6f2ea" } }, "/tmp/plate.png");
  const join = args.join(" ");
  assertEquals(join.includes("color=c=#e8e2d8"), true, "edge colour from the set");
  assertEquals(join.includes("#f6f2ea"), true, "centre lift from the set");
  assertEquals(join.includes("gblur"), true, "the lift is soft, like the backdrop's radial gradient");
});

Deno.test("a proskena-level shot places the person in the frame by arithmetic", () => {
  const filters = personLayerFilters({
    ...base,
    placement: { fitHeight: 0.78, anchorY: 0.08 },
  });
  // 0.78 * 720 = 561.6 -> 562; 0.08 * 720 = 57.6 -> 58
  assertEquals(filters.includes("scale=-1:562"), true, "the lens sizes her in the frame");
  assertEquals(filters.includes("pad=1280:720:(ow-iw)/2:58:color=black@0"), true,
    "the lens anchors her vertically, transparent padding around");
  assertEquals(filters.includes("force_original_aspect_ratio=decrease"), false,
    "placement replaces the default fit-the-frame behaviour");
});

Deno.test("the matte rides the framing chain, and the projection sets her centre", () => {
  const plan = {
    ...base,
    matte: "matte.mp4",
    placement: { fitHeight: 0.624, anchorY: 0.197, anchorX: 0.5 },
    width: 1280,
    height: 720,
  };
  const args = buildCompositeArgs(plan);
  const graph = args[args.indexOf("-filter_complex") + 1] as string;
  const matteChain = graph.split(";").find((c) => c.startsWith("[2:v]")) ?? "";
  assertEquals(matteChain.includes("scale=-1:449"), true, "the matte scales to the placed height");
  assertEquals(matteChain.includes(`pad=1280:720:(ow-iw)*0.5:142`), true,
    "the matte is padded exactly where the person is, at the projected centre");
  // an off-centre projection moves the person, and the matte moves with her
  const off = buildCompositeArgs({ ...plan, placement: { ...plan.placement, anchorX: 0.34 } });
  const offGraph = off[off.indexOf("-filter_complex") + 1] as string;
  const offPerson = offGraph.split(";")[0];
  assertEquals(offPerson.includes("(ow-iw)*0.34"), true, "her centre comes from the projection");
  const offMatte = offGraph.split(";").find((c) => c.startsWith("[2:v]")) ?? "";
  assertEquals(offMatte.includes("(ow-iw)*0.34"), true, "and the matte follows her");
});
