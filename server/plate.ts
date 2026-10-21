// the plate is a render of 3d files. the set (the background) and the props
// are all 3d: assets/sets/*.glb, authored by scripts/build_sets.py. the plate
// the composite consumes is those files rendered through the same pinhole
// that positions her (scene.ts), lit by the set's light recipe (set.ts), so
// the plate and the person agree by construction: one camera.
//
// proskena's studio renderer stays the authored path (its scene files, its
// camera ui). this module emits the headless equivalent: the same recipe and
// the same camera handed to scripts/render_plate.py, a pure-cpu rasterizer.

import type { RoomCamera } from "./scene.ts";
import type { Light, LightRecipe, SetSpec } from "./set.ts";

export interface Frame {
  width: number;
  height: number;
}

export interface PlateSpec {
  set: string; // the 3d file: assets/sets/*.glb
  out: string;
  frame: Frame;
  camera: {
    position: [number, number, number];
    lookAt: [number, number, number];
    fov: number;
  };
  bg: [number, number, number];
  ambient: number;
  lights: Array<{
    color: [number, number, number];
    intensity: number;
    azimuth: number;
    elevation: number;
  }>;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

const AMBIENCE: Record<string, number> = {
  bright: 0.45,
  dim: 0.2,
  dark: 0.08,
};

function lightSpec(l: Light): PlateSpec["lights"][number] {
  return {
    color: hexToRgb(l.color),
    intensity: l.intensity,
    azimuth: l.azimuth,
    elevation: l.elevation,
  };
}

// the plate spec: set + light recipe + camera, everything the renderer needs.
// the white studio set is the white background render: white cyc, bright
// soft light, nothing else in frame.
export function buildPlateSpec(
  set: SetSpec,
  cam: RoomCamera,
  frame: Frame,
  out: string,
  setPath = `assets/sets/${set.name === "prixie white studio" ? "white_studio" : "room"}.glb`,
): PlateSpec {
  const recipe: LightRecipe = LIGHT_RECIPES[set.lighting];
  const lights: Light[] = [recipe.key, recipe.fill, recipe.rim].filter((l) => l.on);
  return {
    set: setPath,
    out,
    frame,
    camera: {
      position: [cam.position.x, cam.position.y, cam.position.z],
      lookAt: [cam.lookAt.x, cam.lookAt.y, cam.lookAt.z],
      fov: cam.fov,
    },
    bg: hexToRgb(set.backdrop.bg).map((c) => Math.round(c * 24)) as [number, number, number],
    ambient: AMBIENCE[recipe.ambience] ?? 0.45,
    lights: lights.map(lightSpec),
  };
}

export function renderPlateCmd(specPath: string): string[] {
  return ["python3", "scripts/render_plate.py", specPath];
}

import { LIGHT_RECIPES } from "./set.ts";
