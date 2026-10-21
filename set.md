# the set: the room is a layer, the person is a layer on top of it

the design, as ruled: the set design is the background, in front of which the
person's video happens with a transparent background. the video model is never
asked to generate the room. a human streamer's room does not change between
clips, and the only way an ai persona gets that property is to stop generating
the room at all: author it once, render it as a plate, and composite the person
over it. or simply put: the model renders the girl, the studio renders the
room, and neither one does the other's job.

## what each side owns

- **proskena is the room.** checked the whole repo (github.com/tinkrland/
  proskena), not only the set folder. `setdesign/42-backdrops.js` renders the
  seamless backdrop from two live values (edge colour, centre lift) and treats
  every preset as a prefill on those values; `lighting/41-lighting.js` is a
  three-light rig (key, fill, rim + hemisphere ambience) with four authored
  recipes; `camera/45-camera-modes.js` has pinned deterministic shots carrying
  their own lens and focus, and `core/43-render-composite.js` turns that lens
  trio into a real depth-of-field composite; `spec/video-recording.md` +
  vendored mediabunny give a deterministic recorder (mp4/mov/webm) whose
  exports are re-renders of recorded state. that is a photographic studio
  whose exports never drift, which is exactly the property the room needs.
- **masky is the girl.** it renders her speaking, lip-synced, in one turn, and
  that is all it should be asked for.

## the alpha problem, measured

the person layer needs to be transparent. masky has no alpha output, no
background parameter, no background removal. so the transparency has to be
made downstream, and the two candidate methods were tested on a real render
(not assumed):

- **chroma: dead.** a verbatim prompt (`promptUpsampling: false`, fixed seed)
  asking for a "completely flat, evenly lit, uniform bright chroma key green
  screen background" came back with a flat dark neutral backdrop instead:
  rgb (52, 51, 56), 0.0% of the frame in the green hue band, identical at
  0.5s, 2.5s and 4.5s. the model ignored the instruction. green screen is not
  available from masky today, so chroma is not the route.
- **matte: works.** "if it's not keyable, remove the background." the same
  clip's 121 frames were matted with a segmentation model (rembg, u2netp, the
  fast one; u2net/isnet-general are the production-quality picks), then
  alphamerged and overlaid on a plate rendered from the set's two backdrop
  values. measured on the composite: 0% leftover original backdrop outside the
  person, and every dark pixel inside the matte is her hair and clothes. the
  backdrop masky does produce (flat, static, evenly lit) is the easy case for a
  matting model.

the verified artifacts from that run (a 5s draft render, $0.0756):

- composite: the person standing in the set plate
  (https://base44.app/api/apps/6a904b98c59a41d175150330/files/mp/public/6a904b98c59a41d175150330/9b6efc251_composite_matte.mp4)
- one composite frame, for judging edge quality by eye
  (https://base44.app/api/apps/6a904b98c59a41d175150330/files/mp/public/6a904b98c59a41d175150330/cfe60db57_composite_matte_frame.png)

## camera and light, adjusted from the proskena level

the camera and the avatar are stationary, so "adjust the camera angle" is not a
generation problem at all: a camera angle change is a shot change, and a shot
change is arithmetic. `placementForShot` in `server/set.ts` maps proskena's
pinned lens to where she sits in the frame (how much of it she fills, where
her top anchors), and `server/composite.ts` applies it to the person layer.
proskena re-renders the plate for the same shot; the composite re-places the
person to match. one shot, two renderers, no model in between.

lighting adjustment from the proskena level is the same idea: the light recipe
proskena renders in three.js also decides the person's grade
(`gradeFromLighting` in `server/set.ts`): the key's colour moves temperature,
the ambience moves brightness, the key's strength moves saturation. the recipe
is now rendered three times: three.js, prompt words, and the composite's
grade. one recipe, all three layers, no drift.

## our own obs + twitch bridge

masky ships a native twitch/OBS integration, and the video branch does not use
it: the bridge is ours (`server/obs.ts`, obs-websocket 5.x). the composite
mp4 is an obs source, proskena's canvas can be another, scene and source
switching are ours to trigger, and streaming to twitch is obs's stream key
plus our toggle. no masky account sits in the streaming path. the protocol
(handshake, challenge/response auth, request/response, item-id resolution) is
exercised against a mock obs in `tests/obs_test.ts`; the one thing left to
verify against a live instance is `SetStreamSettings`' exact params shape.

## camera off, voice on

if she turns off her camera mid-conversation, the voice must not notice. the
protocol (in `server/handoff.ts`): the masky turn owns the current sentence, so
it runs to the sentence's end and the audio clip is never cut. only the visual
goes dark, and it goes dark at the browser level (the obs source hidden, the
livekit camera track muted), never by cancelling the render. once the clip
finishes, masky audio unpublishes and yap owns the voice from the next
utterance on, so there is no odd-sounding seam and no lost context. the
ordering is enforced by construction: hide visual -> wait out the clip ->
unpublish -> switch. voice matching between the two rooms lives on the yap
side: the same retelldb voice profile that maps to masky's voiceStyle cues
selects yap's voice, so the room hears one person.

## the stream session

`server/stream.ts` is what a streamer actually operates: go live (scene
switch, then obs starts streaming to twitch), camera off (the full handoff,
end to end), camera on (the face returns and masky owns the voice again), end.
it owns no protocol of its own: obs.ts speaks obs-websocket, handoff.ts owns
never cutting a sentence, and the session just operates them in the order the
stream needs.

## the pipeline

`server/composite.ts` builds the ffmpeg graphs (pure command builders, no
render inside, so the graphs are testable):

1. person clip in;
2. matte (segmentation model output) merged into the alpha
   (`alphamerge`), or a chroma key if a clip ever comes back keyable;
3. grade pass to seat her in the set's light (brightness/saturation/gamma +
   a warm/cool temperature push, because a clip rendered under a neutral
   studio key will not match a warm gold set until it is pushed);
4. plate behind (a still loops, a recorded proskena take loops too), overlay,
   one opaque mp4 out.

that opaque mp4 is the camera track. the video branch already publishes the
speak turn's video as the livekit camera track; the composite replaces the raw
turn with person-over-set, and nothing downstream changes. for live
browser-side compositing over proskena's own three.js canvas (the real-time
route, closest to how a human streamer's setup reads), the person layer ships
as clip + matte and the browser merges them; vp9-with-alpha does not encode on
this ffmpeg build (the alpha silently drops to yuv420p), and a two-layer merge
in the browser is trivial anyway.

the light is one recipe rendered twice (`server/set.ts`): proskena renders it
in three.js, `lightingPrompt()` renders the same recipe in words for scene
clips, and the composite's grade step ties the person's colour temperature to
the set's. one recipe, both layers, no drift.

## pinned frames are still useful

masky pins a conversation's opening frame (addAvatarLook +
pinConversationImage, in `masky.ts`). that is not the room, but it is the
stable bridge for speak turns: pin a look rendered in the same set and light,
and the person's pose, framing and wardrobe stay consistent between clips
while the composite supplies the room. both mechanisms together: the frame
pins who she is, the composite pins where she is.

## wardrobe, later version

the same layering idea extends to what she wears: a persona should have a
wardrobe the way it has a set. the shape that fits what exists:

- a wardrobe is authored data, like the set: named outfits, each with a
  reference image and metadata, owned per persona. a streamer changes clothes
  deliberately, not randomly, and an outfit is a decision, not a render.
- whering (the wardrobe app) is the natural source: it already digitises a
  person's real clothes (item photos, colour, category, brand). an
  integration pulls wardrobe items in, the persona assembles outfits from
  them, and prixie wears a real person's actual clothes on camera.
- masky-side, an outfit lands as an avatar look (image variant): generate the
  persona in the outfit once, add it as a variant, pin it per conversation.
  the set stays in proskena, the outfit travels with the avatar, and the
  composite is unchanged. an outfit change is a look switch, which masky
  already supports at run time.

parked until the set pipeline is boring. first step when it opens: one
persona, three outfits, each an avatar look pinned in sequence, same set, and
a look at whether the composite needs to know the outfit at all.

## props and screenshare, later versions

- **interactive, pickupable props (next version).** the set's props are
  authored 3d objects (populated via sam's 3d object work), so a prop can
  become interactive the way a streamer's desk bottle is: reachable,
  pickupable, put-back-able. and because a prop is real geometry, not
  something a video model paints per frame, there is no way the form mushes:
  a bottle stays a bottle, with the same silhouette from every angle, and
  only the animation moves. the same lesson as the room, one layer over:
  generated once, animated deliberately, never invented per render.
- **agent screenshare (the version after).** the agent shares its screen into
  the room, the way a human presenter does. with the obs bridge in place this
  is a scene switch: screenshare becomes one more scene with its own source,
  and the person stays in the corner of it if she wants.

## what this leaves

the set is data, the wardrobe will be data, the props will be data, and the
person is the only thing generated. next concrete step: author the first real
plate in proskena (its own renderer, not the flat fallback in `composite.ts`),
run one speak turn through matte + composite, and compare it against the
uncapped render. one comparison tells you whether the room finally stays put.
