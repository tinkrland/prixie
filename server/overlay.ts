// the cam box: how prixie appears inside a screen recording. streamers
// republish twitch sessions to youtube all the time, and when she is present
// in one, her box is not a floating matte over the screen and not a blank
// wall behind her: the box is a mini composite, proskena all the way down.
//
//   the screen recording is the base layer (it is the content; the game,
//   the desktop, the stream)
//   her box carries the room: person over a proskena 3d room render, framed
//   by placementForShot (the pinned lens) and graded by gradeFromLighting
//   (the light recipe), exactly like the call composite, just smaller
//
// placement percentages are frame-relative, so the same proskena camera
// positioning works at box scale unchanged: 0.78 of the box height is 0.78 of
// the call frame's meaning. the room itself is prepopulated (environment,
// props, light): the plate input is a proskena room render from the pinned
// camera, never a flat colour.

import type { SocialTarget } from "./sizes.ts";

export interface BubbleOptions {
  // which corner of the frame the box sits in. streamers default bottom-left
  // or bottom-right; the duration badge and platform chrome own the
  // bottom-right corner on thumbnails, so bottom-left is the safe default.
  corner: "tl" | "tr" | "bl" | "br";
  // fraction of frame width the box spans. streamer cam boxes run roughly a
  // quarter to a third of the width; 0.28 sits in that range.
  widthFraction?: number;
  // the box's aspect. cam sources are widescreen; the person is square, so
  // the width cap in framingFilters keeps her inside and the room shows at
  // the sides, same as a call frame.
  aspect?: number; // width / height, default 16:9
  // minimum gap from the frame edge, fraction of frame width.
  inset?: number;
}

export interface BubbleRect {
  width: number;
  height: number;
  x: number;
  y: number;
}

export function camBubble(
  target: SocialTarget,
  opts: BubbleOptions,
): BubbleRect {
  const widthFraction = opts.widthFraction ?? 0.28;
  const aspect = opts.aspect ?? 16 / 9;
  const inset = opts.inset ?? 0.02;

  const width = Math.round(target.width * widthFraction);
  const height = Math.round(width / aspect);
  const even = (n: number) => n - (n % 2);
  const w = even(width);
  const h = even(height);

  // the box clears whatever the target keeps clear: burned captions live in
  // the bottom band on long form (safeBottom 0.1 there), ui bands on
  // verticals. the inset is the floor; the band is the rule.
  const gapX = Math.round(target.width * inset);
  const bottomGap = Math.max(
    gapX,
    Math.round(target.height * target.safeBottom) + Math.round(target.width * 0.01),
  );
  const topGap = Math.max(gapX, Math.round(target.height * target.safeTop));

  const left = gapX;
  const right = target.width - w - gapX;
  const top = topGap;
  const bottom = target.height - h - bottomGap;

  switch (opts.corner) {
    case "tl":
      return { width: w, height: h, x: left, y: top };
    case "tr":
      return { width: w, height: h, x: right, y: top };
    case "bl":
      return { width: w, height: h, x: left, y: bottom };
    case "br":
      return { width: w, height: h, x: right, y: bottom };
  }
}
