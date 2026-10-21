# studioify

the things we took from proskena (github.com/tinkrland/proskena) live here:
the plate builder that speaks proskena's scene-state schema, the pinhole
camera in proskena's terms, the set specs and light recipes, and the
headless renderer that renders a proskena scene with proskena's own math.
proskena remains the authored path: this is the same system, rendered for
prixie.

- `scene.ts` — the camera: position, lookAt, fov; PersonAnchor and
  projectPlacement (where she stands in the room, computed from geometry).
- `set.ts` — sets, light recipes (key/fill/rim + ambience), backdrops,
  scenePrompt.
- `plate.ts` — buildPlateSpec: proskena scene-state as prixie's plate.
- `render_plate.py` — the headless renderer: same math as proskena's
  renderer (linear workflow, lambert, sRGB, no tonemapping).

## roadmap: interactive props, sam 3d objects

the room is currently a rendered background she stands in. the direction
is a room she is IN: props that react to her, and objects that come from
the real world.

**stage 1, scans as props (done).** real objects enter the room as glb
scans with vertex colour (cfseru_byxfee: 13MB scan -> 24k faces, 432KB,
lit by the proskena rig). the pipeline: decimate with colour transfer,
sit on the floor, render per-face. room-main's object math already
places props with metre positions and rotations.

**stage 2, sam 3d segmentation.** segment anything (meta's sam/sam2,
and the sam-3d / sam-part3d line) turns a photo or scan into an isolated
object: prompt a mask, lift it to a mesh (mobile sam-3d style single-view
reconstruction, or part3d for sub-object parts). the seams:

- a photo of a real object -> sam mask -> 3d lift -> the same
  load_glb_prop path as stage 1. the room fills with HER objects, not
  kit placeholders.
- sub-object parts (sam-part3d) are the interaction surface: a drawer
  that opens, a mug that lifts, a book that slides. the part hierarchy
  is what interactive props are made of.
- prop identity goes to retelldb with the rest of the context: what the
  mug is, that the owner made it, where it sits in the room.

**stage 3, interaction.** an interactive prop is a prop with state
(open/closed, held/put-down) plus a stage cue: when she says "let me grab
this", the hand's reach zone intersects the prop's part (scene.ts already
computes person extent in the frame), the part animates its transform in
the plate spec, and the render reflects it next frame. the cue travels
the same speak-turn pipeline (masky renders the utterance; the plate spec
changes state alongside). state lives with the persona so it survives
cuts.

**stage 4, physics-lite.** parts get colliders and resting constraints
so putting a mug down puts it ON the desk. renderer-side this is
placement snap plus a drop test, not a solver; the aim is continuity, not
simulation.

what this roadmap deliberately does not do: make the renderer a game
engine. every stage keeps the proskena rule: the scene is authored state,
rendered headlessly; interaction edits state, never pixels.
