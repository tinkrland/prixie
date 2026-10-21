// the camera render, done like proskena does it: she is IN the room, the
// camera is IN the room, and her rect in frame is projected, not picked.
//
// the mistake this replaces: placement as screen-space percentages (she fills
// 78 percent of the frame, anchored at 8 percent). that composes a sticker,
// not a person: she floats over a flat plate with no ground contact and no
// relationship to the room's geometry. the point, restated until it is
// structural:
//
//   the person (video) is the FOREGROUND. the set design, the environment,
//   everything else is BACKGROUND.
//
// so the person is anchored in the room (a floor point, a height, the extent
// of her the clip shows) and the proskena-style pinned camera (position, fov,
// lookAt) projects that anchor through a real pinhole model. her size in frame
// is her distance from the camera. her position in frame is the room's
// geometry. where her clip ends, the floor continues: ground contact is
// computed, not hoped for.
//
// pure math, no webgl: the plate is still proskena's renderer's job. this
// module only decides where the person goes in that render, which is exactly
// the question a camera answers.

import type { Placement } from "./composite.ts";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoomCamera {
  position: Vec3; // metres, room coords
  lookAt: Vec3; // where the lens points (proskena pins this per shot)
  fov: number; // vertical fov, degrees. proskena lenses: 15 (close) to 50 (wide)
}

export interface PersonAnchor {
  // where she stands in the room
  floor: Vec3; // a point on the floor under her centre
  height: number; // her full standing height, metres (~1.68)
  // the vertical extent of her the clip actually shows, metres above the
  // floor. a bust crop (the masky portrait framing) might show 1.0 to 1.68;
  // a full figure shows 0 to 1.68. the projection sizes and places exactly
  // what the clip shows.
  visibleBottom: number;
  visibleTop: number;
}

export interface ProjectedPlacement extends Placement {
  anchorX: number; // her horizontal centre, fraction of frame width
  groundY: number; // where the floor meets her feet, fraction of frame height
  // (for a bust crop this is where the floor WOULD be: use it to check the
  // crop's bottom sits above it, i.e. she reads as standing at depth, not
  // floating)
  distance: number; // metres from the camera, for the record
}

const DEG = Math.PI / 180;

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function normalize(a: Vec3): Vec3 {
  const len = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / len, y: a.y / len, z: a.z / len };
}

// the pinhole projection: world point -> fraction-of-frame screen point.
// screen x runs left to right, screen y TOP to bottom (the composite's
// convention: anchorY is where her top sits).
export function projectPoint(
  cam: RoomCamera,
  point: Vec3,
  frame: { width: number; height: number },
): { x: number; y: number; z: number } {
  const focal = (frame.height / 2) / Math.tan((cam.fov * DEG) / 2);
  const forward = normalize(sub(cam.lookAt, cam.position));
  const right = normalize(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const d = sub(point, cam.position);
  const z = dot(d, forward); // depth along the lens axis
  const x = (frame.width / 2) + (focal * dot(d, right)) / z;
  const y = (frame.height / 2) - (focal * dot(d, up)) / z;
  return { x, y, z };
}

// the camera render: her placement in frame, projected from the room. this is
// the placement the composite consumes, and the only source of it.
export function projectPlacement(
  cam: RoomCamera,
  person: PersonAnchor,
  frame: { width: number; height: number },
): ProjectedPlacement {
  const centreX = person.floor.x;
  const top = projectPoint(cam, { x: centreX, y: person.visibleTop, z: person.floor.z }, frame);
  const bottom = projectPoint(cam, { x: centreX, y: person.visibleBottom, z: person.floor.z }, frame);
  const ground = projectPoint(cam, { x: centreX, y: 0, z: person.floor.z }, frame);
  const pxTop = Math.min(top.y, bottom.y);
  const pxBottom = Math.max(top.y, bottom.y);
  return {
    fitHeight: (pxBottom - pxTop) / frame.height,
    anchorY: pxTop / frame.height,
    anchorX: top.x / frame.width,
    groundY: ground.y / frame.height,
    distance: top.z,
  };
}

// a default room setup that reads like a streamer's: camera at seated eye
// height across the desk from her, lens pinned at her face, room behind.
// the light recipe still comes from set.ts; this is only where things are.
export function streamerRoom(): { cam: RoomCamera; person: PersonAnchor } {
  return {
    cam: {
      position: { x: 0, y: 1.35, z: 1.9 },
      lookAt: { x: 0, y: 1.35, z: 0 },
      fov: 32,
    },
    person: {
      floor: { x: 0, y: 0, z: 0 },
      height: 1.68,
      visibleBottom: 1.0, // the masky portrait crop: chest up
      visibleTop: 1.68,
    },
  };
}
