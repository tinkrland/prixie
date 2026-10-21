// the composite: the set is the backdrop, the person is a layer on top of it.
//
// this is the piece that makes the room real. the set is authored once in
// proskena (backdrop values, light recipe, pinned shot) and rendered as a
// plate; the person's clip is rendered by masky and stripped of its own
// background; the plate goes behind, the person goes in front. the video model
// never sees the room, so it cannot reinvent it.
//
// masky gives no alpha, which is the one hard constraint here. two ways out,
// and both are ffmpeg jobs:
//
// - chroma: ask the model for a flat backdrop and key it. measured, not
//   assumed: a verbatim prompt asking for a uniform bright chroma green screen
//   came back with a flat dark neutral backdrop (rgb 52,51,56, 0% of the frame
//   in the green hue band) and the model ignored the instruction entirely. so
//   green screen is not available from masky today and chroma is the fallback,
//   not the route.
// - matte: cut the person out with a segmentation model (RVM, MODNet, BiRefNet,
//   rembg), producing an alpha matte that survives hair. this is the route,
//   and it is cheap in wall time: the backdrop masky does produce is flat and
//   static, which is the easy case for a matting model. this module builds the
//   ffmpeg half (alphamerge + overlay) and takes the matte as an input.
//
// output shape matters too:
// - one opaque mp4: the composite IS the camera track (livekit, OBS, a
//   recording). simplest, and what the video branch publishes today.
// - a transparent webm (VP9 + alpha): for compositing live in the browser
//   over proskena's own canvas, which is the real-time route and the closest
//   thing to what a human streamer's setup does.
//
// everything here is a pure command builder: no ffmpeg runs inside, so the
// filter graphs are testable without a render.

export interface ChromaKey {
  // the colour to remove. sample it from the actual clip, never assume.
  color: string; // hex, e.g. "00b140"
  similarity: number; // 0..1, how close a pixel must be to be keyed
  blend: number; // 0..1, edge softness
  despill: boolean;
}

export interface Grade {
  // the grade exists for one reason: seat the person in the set's light.
  // a clip rendered under a neutral studio key will not match a warm gold set
  // until it is pushed.
  brightness?: number; // -1..1
  saturation?: number; // 0..3
  gamma?: number; // 0.1..10
  temperature?: number; // -1..1, negative cools, positive warms
}

export interface CompositePlan {
  person: string; // the masky clip
  plate: string; // the set plate: a proskena export, still or loop
  out: string;
  key?: ChromaKey;
  matte?: string; // grayscale matte video/image, person-shaped, white on black
  grade?: Grade;
  // where she sits in the frame, from the proskena-level camera
  // (placementForShot). absent = fill the frame, the default framing. the
  // camera and the avatar are stationary, so this is arithmetic on the lens,
  // not a generation.
  placement?: Placement;
  width: number;
  height: number;
  fps?: number;
}

export interface Placement {
  fitHeight: number; // fraction of frame height the person fills
  anchorY: number; // where her top sits, fraction of frame height
}

function gradeFilters(grade?: Grade): string[] {
  if (!grade) return [];
  const filters: string[] = [];
  if (grade.brightness !== undefined || grade.saturation !== undefined || grade.gamma !== undefined) {
    filters.push(
      `eq=brightness=${grade.brightness ?? 0}:saturation=${grade.saturation ?? 1}:gamma=${grade.gamma ?? 1}`,
    );
  }
  if (grade.temperature) {
    // warm/cool push: raise or lower red against blue.
    const r = 1 + grade.temperature * 0.12;
    const b = 1 - grade.temperature * 0.12;
    filters.push(`colorchannelmixer=rr=${r.toFixed(3)}:bb=${b.toFixed(3)}`);
  }
  return filters;
}

// the person layer: clip in, alpha out (as the overlay's second input).
export function personLayerFilters(plan: CompositePlan): string {
  let framing: string[];
  if (plan.placement) {
    // a proskena-level shot: the lens says how much of the frame she fills
    // and where her top sits. she is centred horizontally either way.
    const targetH = Math.round(plan.placement.fitHeight * plan.height);
    const top = Math.round(plan.placement.anchorY * plan.height);
    framing = [
      `scale=-1:${targetH}`,
      `pad=${plan.width}:${plan.height}:(ow-iw)/2:${top}:color=black@0`,
    ];
  } else {
    framing = [
      `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=decrease`,
      `pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    ];
  }
  const filters: string[] = [...framing, "format=rgba"];
  if (plan.key) {
    // colorkey works in rgb, which is what a model's rendered backdrop is.
    filters.push(
      `colorkey=${plan.key.color}:${plan.key.similarity}:${plan.key.blend}`,
    );
    if (plan.key.despill) filters.push("despill=type=green:mix=0.5:expand=0.4");
  }
  filters.push(...gradeFilters(plan.grade));
  return filters.join(",");
}

// the plate layer: cover the frame, never letterbox the room.
export function plateLayerFilters(plan: CompositePlan): string {
  return [
    `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=increase`,
    `crop=${plan.width}:${plan.height}`,
    "format=rgba",
  ].join(",");
}

// the whole graph. the plate is the base, the person is overlaid; when a matte
// is supplied it is merged into the person's alpha instead of a key.
function plateInput(plate: string): string[] {
  // a still plate is the common case (an exported proskena frame). it must
  // loop, or overlay's shortest=1 ends the composite after one frame, which is
  // exactly the bug this comment exists to prevent.
  return /\.(png|jpe?g|webp)$/i.test(plate)
    ? ["-loop", "1", "-i", plate]
    : ["-stream_loop", "-1", "-i", plate];
}

export function buildCompositeArgs(plan: CompositePlan): string[] {
  const fps = plan.fps ?? 30;
  const args = ["-y", ...plateInput(plan.plate), "-i", plan.person];
  let personChain: string;
  if (plan.matte) {
    args.push("-i", plan.matte);
    personChain =
      `[1:v]${personLayerFilters(plan)}[person];` +
      `[2:v]scale=${plan.width}:${plan.height},format=gray[matte];` +
      `[person][matte]alphamerge[fg]`;
  } else {
    personChain = `[1:v]${personLayerFilters(plan)}[fg]`;
  }
  const graph =
    `${personChain};` +
    `[0:v]${plateLayerFilters(plan)},fps=${fps}[bg];` +
    `[bg][fg]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]`;
  return [
    ...args,
    "-filter_complex", graph,
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    plan.out,
  ];
}

// the transparent export: the person layer alone, VP9 with alpha, for
// compositing over proskena's live canvas in a browser.
export function buildAlphaExportArgs(plan: CompositePlan): string[] {
  const args = ["-y", "-i", plan.person];
  const filters = [
    `scale=${plan.width}:${plan.height}:force_original_aspect_ratio=decrease`,
    `pad=${plan.width}:${plan.height}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    "format=yuva420p",
  ];
  if (plan.key) {
    args.push("-i", plan.person);
    filters.push(
      `colorkey=${plan.key.color}:${plan.key.similarity}:${plan.key.blend}`,
    );
    if (plan.key.despill) filters.push("despill=type=green:mix=0.5:expand=0.4");
  }
  return [
    ...args,
    "-vf", filters.join(","),
    "-an",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-auto-alt-ref", "0",
    plan.out,
  ];
}

// ---------------------------------------------------------------------------
// the plate: what the person stands in front of
// ---------------------------------------------------------------------------

export interface Plate {
  width: number;
  height: number;
  backdrop: { bg: string; center: string };
}

// a flat fallback plate from the set's two values, for tests and for the case
// where proskena's export is not to hand. the authored plate (proskena's own
// render, with props and its light rig baked in) is always the better one.
export function plateArgs(plate: Plate, out: string): string[] {
  const bg = `#${plate.backdrop.bg.replace("#", "")}`;
  const center = `#${plate.backdrop.center.replace("#", "")}`;
  return [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=${bg}:s=${plate.width}x${plate.height}:d=1`,
    "-vf",
    // a soft centre lift behind the subject head, matching proskena's
    // backdropTexture: a radial gradient from the centre colour to the edge.
    `drawbox=x=${Math.round(plate.width * 0.22)}:y=${Math.round(plate.height * 0.1)}:w=${Math.round(plate.width * 0.56)}:h=${Math.round(plate.height * 0.8)}:color=${center}@0.85:t=fill,` +
    `gblur=sigma=${Math.round(plate.width / 8)}`,
    "-frames:v", "1",
    out,
  ];
}
