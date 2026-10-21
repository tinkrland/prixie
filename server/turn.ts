// a speak turn, as stages. the point of this module: background removal is
// stage one of the pipeline, not an external input. the masky clip arrives
// with its own rendered background; the turn removes it (rembg, scripts/
// matte.py), renders the plate (the proskena scene the set describes), and
// composites: person foreground, the proskena background everything else.
//
// every stage is a pure builder so the turn is testable without running
// ffmpeg, rembg, or the renderer.

import { buildCompositeArgs, type CompositePlan } from "./composite.ts";
import { buildMatteCmd } from "./matte.ts";
import { buildPlateSpec, renderPlateCmd, type PlateSpec } from "../studioify/plate.ts";
import { projectPlacement, type PersonAnchor, type RoomCamera } from "../studioify/scene.ts";
import type { SetSpec } from "../studioify/set.ts";

export interface Frame {
  width: number;
  height: number;
}

export interface TurnInput {
  person: string; // the masky clip: her, on her own rendered background
  set: SetSpec;
  cam: RoomCamera;
  // who she is on this stage: the anchor carries her floor point and height,
  // so the turn projects her placement from the room geometry, never a
  // screen-space percentage
  anchor: PersonAnchor;
  frame: Frame;
  // when the caller already holds a matte (a cached one, or a clip the model
  // rendered transparent), the stage is skipped for that turn only
  matte?: string;
  paths: {
    matte: string;
    plateSpec: string;
    plate: string;
    out: string;
  };
  grade?: CompositePlan["grade"];
}

export interface TurnPlan {
  matteCmd: string[] | null; // null only when a matte was supplied
  plateCmd: string[];
  plateSpec: PlateSpec;
  composite: string[];
}

export function planSpeakTurn(input: TurnInput): TurnPlan {
  const matteCmd = input.matte
    ? null
    : buildMatteCmd(input.person, input.paths.matte);
  const matte = input.matte ?? input.paths.matte;
  const plateSpec = buildPlateSpec(input.set, input.cam, input.frame, input.paths.plate);
  const placement = projectPlacement(input.cam, input.anchor, input.frame);
  const composite = buildCompositeArgs({
    person: input.person,
    matte,
    plate: input.paths.plate,
    out: input.paths.out,
    width: input.frame.width,
    height: input.frame.height,
    fps: 24,
    grade: input.grade,
    placement,
  });
  return {
    matteCmd,
    plateCmd: renderPlateCmd(input.paths.plateSpec),
    plateSpec,
    composite,
  };
}
