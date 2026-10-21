// the plate is a render of a proskena scene. the 3d system that exists is
// proskena's: its scene state schema (proskena-scene-state), its backdrop (a
// gradient plane from two values), its prop library (authored placeholder
// geometry placed as scene objects), its light rig (key/fill/rim at azimuth/
// elevation plus hemispheric ambience), its camera (live position + target +
// fov). this module speaks that schema so prixie's plate IS the scene
// proskena describes, rendered headlessly by scripts/render_plate.py with the
// same math. proskena's studio renderer stays the authored path.
//
// the subject (the bust, the hand) is not on prixie's stage: the masky person
// replaces it, so plates render subject: null. the person is composited in
// front by composite.ts; the proskena scene is all background.

import type { RoomCamera } from "./scene.ts";
import type { Light, LightRecipe, SetSpec } from "./set.ts";
import { LIGHT_RECIPES, PERSON_STAGE_SCALE } from "./set.ts";

export interface Frame {
  width: number;
  height: number;
}

// the renderer's spec: proskena's scene state shape, plus render targets
export interface PlateSpec {
  schema: "proskena-scene-state";
  live: {
    position: [number, number, number]; // proskena units (mm-ish)
    target: [number, number, number];
    fov: number;
  };
  environment: { bg: string; center: string };
  props: SetSpec["props"];
  lighting: {
    ambience: string;
    key: LightSpec;
    fill: LightSpec;
    rim: LightSpec;
  };
  sceneScale: number;
  subject: string | null;
  frame: Frame;
  out: string;
}

interface LightSpec {
  on: boolean;
  color: string;
  intensity: number;
  azimuth: number;
  elevation: number;
}

// a proskena scene unit is a millimetre at subject scale (the bust is 225
// units for 225mm), so metres arrive as x1000. the person stage scale is
// applied by the renderer to proskena's AUTHORED constants (backdrop size,
// prop placement band, rig distance), which were authored around a 225-unit
// subject; the camera is already at person scale.
function toStage(v: number): number {
  return v * 1000;
}

function lightSpec(l: Light): LightSpec {
  return {
    on: l.on,
    color: l.color,
    intensity: l.intensity,
    azimuth: l.azimuth,
    elevation: l.elevation,
  };
}

export function buildPlateSpec(
  set: SetSpec,
  cam: RoomCamera,
  frame: Frame,
  out: string,
  opts: { subject?: string | null } = {},
): PlateSpec {
  const recipe: LightRecipe = LIGHT_RECIPES[set.lighting];
  return {
    schema: "proskena-scene-state",
    live: {
      position: [
        toStage(cam.position.x),
        toStage(cam.position.y),
        toStage(cam.position.z),
      ],
      target: [
        toStage(cam.lookAt.x),
        toStage(cam.lookAt.y),
        toStage(cam.lookAt.z),
      ],
      fov: cam.fov,
    },
    environment: { bg: set.backdrop.bg, center: set.backdrop.center },
    props: set.props,
    lighting: {
      ambience: recipe.ambience,
      key: lightSpec(recipe.key),
      fill: lightSpec(recipe.fill),
      rim: lightSpec(recipe.rim),
    },
    sceneScale: PERSON_STAGE_SCALE,
    subject: opts.subject ?? null,
    frame,
    out,
  };
}

export function renderPlateCmd(specPath: string): string[] {
  return ["python3", "scripts/render_plate.py", specPath];
}
