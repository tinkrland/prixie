// the set: prixie's room, and the light in it.
//
// a human streamer's room does not change between clips. an ai video model
// invents a new room every render, so a persona whose background is
// model-generated reads as a different person in a different place each time.
// the fix has three parts, and only one of them needs masky's help:
//
// 1. the room is authored once, not generated per clip. proskena
//    (github.com/tinkrland/proskena, setdesign/ + lighting/ + camera/) is
//    exactly that authoring tool: a seamless backdrop rendered from two
//    values (edge colour, centre lift), a three-light rig with authored
//    recipes, and pinned deterministic camera shots carrying their own lens
//    and focus. it exports the still; we do not have to invent a room
//    vocabulary, because proskena already has one and treats every preset as
//    a prefill over the same values (setdesign/42-backdrops.js).
// 2. the still is pinned on the conversation, so every turn renders from it.
//    masky has no background parameter and no alpha output, but it does pin a
//    conversation's opening frame (addAvatarLook + pinConversationImage in
//    masky.ts). one authored frame, every clip in the same room.
// 3. the light is one recipe rendered twice. masky exposes no lighting
//    parameter, so the set's recipe is translated into the prompt language of
//    /videos/generate for scene clips, and for speak turns the pinned frame
//    itself carries the light. the recipe stays the single source: proskena
//    renders it in three.js, this module renders it in words.
//
// what masky cannot do: a transparent person. there is no alpha output and no
// background control, so "focused person over a live 3d set" needs a matte.
// parked in set.md as route b, with its caveats.

import { addAvatarLook, type Avatar, type ConversationHandle, pinConversationImage } from "./masky.ts";
import type { Grade } from "./composite.ts";

// ---------------------------------------------------------------------------
// the light rig, mirrored from proskena lighting/41-lighting.js
// ---------------------------------------------------------------------------

export interface Light {
  on: boolean;
  color: string;
  intensity: number;
  azimuth: number; // degrees, camera-relative
  elevation: number;
}

export interface LightRecipe {
  label: string;
  ambience: "bright" | "dim" | "dark";
  key: Light;
  fill: Light;
  rim: Light;
}

// values copied verbatim so the two renderers cannot drift. if proskena's rig
// changes, this table changes with it in the same commit: it is a mirror, not
// a second opinion.
export const LIGHT_RECIPES: Record<string, LightRecipe> = {
  soft_studio: {
    label: "soft studio",
    ambience: "bright",
    key: { on: true, color: "#fff4e6", intensity: 3.0, azimuth: 40, elevation: 55 },
    fill: { on: true, color: "#d6e8ff", intensity: 1.1, azimuth: -55, elevation: 20 },
    rim: { on: true, color: "#ffffff", intensity: 2.0, azimuth: 165, elevation: 45 },
  },
  bright_commercial: {
    label: "bright commercial",
    ambience: "bright",
    key: { on: true, color: "#ffffff", intensity: 4.6, azimuth: 25, elevation: 60 },
    fill: { on: true, color: "#eef4ff", intensity: 2.0, azimuth: -45, elevation: 30 },
    rim: { on: true, color: "#ffffff", intensity: 1.2, azimuth: 170, elevation: 50 },
  },
  dramatic_rim: {
    label: "dramatic rim",
    ambience: "dark",
    key: { on: true, color: "#ffe9d2", intensity: 1.3, azimuth: 55, elevation: 35 },
    fill: { on: true, color: "#aac4e8", intensity: 0.25, azimuth: -60, elevation: 15 },
    rim: { on: true, color: "#ffffff", intensity: 4.4, azimuth: 160, elevation: 30 },
  },
  warm_gold: {
    label: "warm gold",
    ambience: "dim",
    key: { on: true, color: "#ffd9a0", intensity: 3.3, azimuth: 35, elevation: 50 },
    fill: { on: true, color: "#ffe9d0", intensity: 0.8, azimuth: -50, elevation: 25 },
    rim: { on: true, color: "#fff3e0", intensity: 2.4, azimuth: 150, elevation: 55 },
  },
};

// ---------------------------------------------------------------------------
// the set
// ---------------------------------------------------------------------------

// the backdrop is two values, the way proskena's is: the edge colour and the
// centre lift behind the subject.
export interface Backdrop {
  bg: string;
  center: string;
}

// a pinned shot: framing plus the lens that decides what is soft. this is
// proskena's pinned camera (fov, focallength, focaldistance) and it is also
// the answer to "the model focuses on the background": the person is the
// subject, the set is behind them and slightly out of focus.
export interface PinnedShot {
  fov: number;
  focallength: number;
  focaldistance: number;
}

export interface SetSpec {
  name: string;
  backdrop: Backdrop;
  lighting: keyof typeof LIGHT_RECIPES;
  shot: PinnedShot;
  // the authored still, once proskena has exported it: added as an avatar look
  // and pinned on the conversation.
  stillUrl?: string;
}

const DEFAULT_SHOT: PinnedShot = { fov: 30, focallength: 50, focaldistance: 330 };

export function defaultSet(overrides: Partial<SetSpec> = {}): SetSpec {
  return {
    name: "prixie desk",
    backdrop: { bg: "#e8e2d8", center: "#f6f2ea" },
    lighting: "soft_studio",
    shot: DEFAULT_SHOT,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// camera angle, from the proskena level
// ---------------------------------------------------------------------------

// the camera and the avatar are both stationary, so a camera angle change is
// a shot change, and a shot change is deterministic arithmetic, not a
// generation. proskena re-renders the plate for the same pinned shot (its
// camera modes carry the lens), and the composite places the person to match:
// the lens decides how much of her fills the frame and where she sits in it.
// one shot, two renderers, no model in between.
export interface Placement {
  fitHeight: number; // fraction of frame height the person fills
  anchorY: number; // where her top sits, fraction of frame height
}

export function placementForShot(shot: PinnedShot): Placement {
  const fl = shot.focallength;
  if (fl <= 35) return { fitHeight: 0.6, anchorY: 0.18 }; // medium wide: waist-up, room around her
  if (fl <= 60) return { fitHeight: 0.78, anchorY: 0.08 }; // medium portrait: chest-up
  if (fl <= 90) return { fitHeight: 0.92, anchorY: 0.03 }; // portrait: head and shoulders
  return { fitHeight: 1.0, anchorY: 0.0 }; // close portrait: she fills the frame
}

// lighting adjustment from the proskena level: the recipe proskena renders in
// three.js also decides the person's grade in the composite. the clip comes
// out under a neutral studio key; the recipe says where the key actually
// sits (warm gold, dim room), and this pushes the person until she is lit by
// the same recipe. the ambience moves brightness, the key's colour moves
// temperature, the key's strength moves saturation. one recipe, rendered
// three times now: three.js, prompt words, and the composite's grade.
export function gradeFromLighting(recipe: LightRecipe): Grade {
  const hex = recipe.key.color.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const temperature = Math.max(-0.3, Math.min(0.3, ((r - b) / 255) * 0.3));
  const brightness = recipe.ambience === "bright" ? 0.03 : recipe.ambience === "dim" ? -0.02 : -0.06;
  const saturation = Math.max(0.9, Math.min(1.1, 1 + (recipe.key.intensity - 3) * 0.02));
  return { temperature, brightness, saturation };
}

// ---------------------------------------------------------------------------
// recipe -> prompt language
// ---------------------------------------------------------------------------

function warmth(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "neutral";
  const r = parseInt(hex.slice(0, 2), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const delta = r - b;
  if (delta >= 20) return "warm";
  if (delta <= -20) return "cool";
  return "neutral";
}

// azimuth is degrees around the subject; 0 is behind camera, 90 is camera
// right. the prompt says what the light does, not what the numbers are: a
// video model reads "soft warm key from camera left", not "azimuth 40".
function side(azimuth: number): string {
  const a = ((azimuth % 360) + 360) % 360;
  if (a < 22 || a > 338) return "frontal";
  if (a < 112) return "camera right";
  if (a < 202) return "behind";
  return "camera left";
}

function strength(intensity: number): string {
  if (intensity >= 3.5) return "strong";
  if (intensity >= 2) return "clear";
  if (intensity >= 1) return "soft";
  return "faint";
}

export function lightingPrompt(set: SetSpec): string {
  const r = LIGHT_RECIPES[set.lighting];
  if (!r) throw new Error(`unknown light recipe: ${set.lighting}`);
  const parts: string[] = [];
  parts.push(
    `${strength(r.key.intensity)} ${warmth(r.key.color)} key light from ${side(r.key.azimuth)}`,
  );
  if (r.fill.on) {
    parts.push(
      `${strength(r.fill.intensity)} ${warmth(r.fill.color)} fill from ${side(r.fill.azimuth)}`,
    );
  }
  if (r.rim.on) {
    parts.push(
      `${strength(r.rim.intensity)} rim light ${side(r.rim.azimuth)} catching the hair`,
    );
  }
  parts.push(
    r.ambience === "dark" ? "dim room, deep shadows" : r.ambience === "dim" ? "low-key room" : "bright even room",
  );
  return parts.join(", ");
}

// the lens half of the set: what is sharp and what is not.
export function shotPrompt(set: SetSpec): string {
  const { focallength, focaldistance } = set.shot;
  const close = focaldistance < 260;
  const framing = focallength <= 35 ? "medium wide" : focallength >= 85 ? "close portrait" : "medium portrait";
  return [
    `${framing} shot, ${focallength}mm lens`,
    close ? "shallow depth of field, the subject sharp, the room softly out of focus" : "the room falling away softly behind the subject",
    "static camera, no camera movement",
  ].join(", ");
}

// the backdrop half: the two values, in words, plus the instruction that
// matters most, that the room does not change.
export function backdropPrompt(set: SetSpec): string {
  return [
    `seamless studio backdrop, ${describe(set.backdrop.center)} lit centre lifting to ${describe(set.backdrop.bg)} at the edges`,
    "plain walls, nothing on them, the same room in every shot",
  ].join(", ");
}

function describe(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "a neutral tone";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const light = (r + g + b) / 3;
  const name = light > 220 ? "near-white" : light > 180 ? "pale" : light > 120 ? "mid" : "deep";
  return `${name} ${warmth(color)} ${r > g && g > b ? "cream" : b > r ? "grey-blue" : "neutral"}`;
}

// the full prompt for a scene clip (POST /videos/generate). keep
// promptUpsampling false when this is used: the model must not add detail of
// its own to a set we authored.
export function scenePrompt(set: SetSpec, action: string): string {
  return `${action} ${backdropPrompt(set)}, ${lightingPrompt(set)}, ${shotPrompt(set)}`;
}

// ---------------------------------------------------------------------------
// pinning the set on the conversation
// ---------------------------------------------------------------------------

// author the still in proskena, then: add it as an avatar look and pin it.
// returns the stored url, which is what the conversation keeps.
export async function pinSet(
  avatar: Avatar,
  handle: ConversationHandle,
  stillUrl: string,
): Promise<{ assetId: string; url: string }> {
  const look = await addAvatarLook(avatar.avatarId, stillUrl);
  await pinConversationImage(handle, look.url);
  return look;
}
