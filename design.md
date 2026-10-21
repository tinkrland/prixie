# video design

## what this is

prixie's camera presence. the join engine on main joins with camera off by default. video is the optional layer that replaces the black square with a talking avatar from masky.ai.

## what the docs answered (oct 21, 2026)

the api reference lives at https://masky.ai/masky-api.md. read it before changing server/masky.ts. the open questions from the first pass are now settled:

- **clip-based, not streaming.** masky has no live-face mode. a conversation holds a sequence of turns; each speak turn (mode: "speak", output: "video", <= 500 chars) renders a lip-synced clip, ~20-60s. there is no "stream the face" api.
- **the gap closes on the playback side, not the render side.** the conversation's liveUrl auto-plays turns in order the moment each renders, and silent-renders (idle clips: blinks, small head motion, billed once per avatar image) fill the view whenever nothing is playing. so: speak turn for utterance N+1 while the live view plays N and idles. keep turns <= 3 sentences so turn id and clip stay 1:1 (longer text silently auto-chunks into extra turn docs).
- **scripted speak turns are cached.** same avatar + voice + text renders once; replays across conversations are free (fromSpeakCache: true). the meeting hello clip costs once, ever.
- **masky owns the tts for the face.** the speak flow takes TEXT, not audio: higgs tts + lip-sync are rendered together, with delivery cues (voiceStyle emotion/style/prosody, inline sfx/pause tags). yap's live room voice and the on-screen face are two different pipes. for full sync they need the same voice: avatar = cloned voice, yap = same source for TTS. the agent-binding bridge (below) is the other way to unify: let masky be only the face, prixie be the brain.
- **persona faces** work natively: each persona gets its own avatar (ensurePersonaAvatar creates image + voice on first use), and a conversation pins its look via avatarImageUrl from the avatar's image variants.

## the voice handoff (one voice, two rooms)

a call uses livekit for voice and masky for the face. two tts providers would
drift: the room hears one render while the mouth moves to another. so masky owns
the voice when she is on camera. a speak turn renders higgs tts (the avatar's
cloned voice, delivery cues via voiceStyle) and the lip-sync together, and hands
back audioUrl + videoUrl from the same turn. yap publishes both: audioUrl as her
livekit audio track, videoUrl as her camera track. the room hears the render the
mouth is moving to, by construction.

- retelldb decides what the voice is: the persona's memory (what she knows) and
  the persona's voice profile (how she says it). the profile is vendored here
  (retelldb/ from yap) so knowledge and delivery point at the same persona.
- voiceStyleFromProfile maps tone_defaults (0..1) and the medium register onto
  masky's named cues: sarcasm -> amusement, low confidence -> speed_slow +
  expressive_low, a whispered register -> style whispering. this is the only
  place the fuzzy profile vocabulary meets masky's enum.
- draft is the default tier on every turn (0.015/s vs 0.025/s at 720p). a
  meeting face is presence, not a render; bump the hello clip and recorded
  demos to standard.
- idle clips (silent renders) keep the face breathing between turns instead of
  freezing on a still.
- yap implements exactly one interface to take part: RoomPublisher.publish({audioUrl, videoUrl}).
  runCall() drives the loop: hear -> say -> publish, idle when there is nothing.

## the camera publishing seam

masky hands back three surfaces, in order of readiness:

1. **videoUrl**: the raw mp4 (h264+aac, ~6s for a short line). for livekit rooms (yap), publish it as a camera track; render the next turn during the current one so the track switch is seamless.
2. **turnLiveUrl** (/live/t-...): clean single-clip player, embeddable in an iframe, no token needed.
3. **conversation liveUrl** (/live/c-...): the orchestrated live view: auto-plays turns, idle loops between them, captions, play/pause. obs native, iframe embeddable. for browser-joined meetings (main's headless browserbase join), the realistic camera presence is this page shared as screen, or the player embedded where the platform allows custom camera input.

## prixie as the avatar's brain (agent binding)

masky avatars can delegate chat-mode thinking to an external agent over nostr (PUT /avatars/{avatarId}/agent-binding: pubkey + relay). the avatar publishes a masky_turn_request event; prixie's harness thinks locally and POSTs the reply; masky renders the face. this is the path where prixie keeps her own voice models and memory (retelldb on yap) and masky is purely the face. fallback: "gemini" answers hosted, "fail" errors the turn.

## order of work

1. ~~api key + docs land, fill in the client~~ done: server/masky.ts is wired and smoke-tested live (oct 21: image -> avatar -> conversation -> speak turn -> 6.04s h264 clip in ~20s, ~$0.16 total)
2. the prixie avatar exists (avatarId UgVXv5xGRjd4YVLePtl8, voice: alice bennett); per-persona faces via ensurePersonaAvatar
3. camera track publishing into a livekit room (yap seam)
4. agent binding for prixie-as-brain once the voice side decides on nostr

## cantina.com: no api, so talk to them

cantina.com (wearecantina) is the closest thing to prixie's natural habitat
that she cannot enter: a social platform where members keep AI avatars that
hang out in video rooms. a rendered persona that joins a room, watches, and
speaks when spoken to is exactly what cantina already hosts natively. the
problem: cantina exposes no public api. neither seam works:

- the livekit track path dead-ends: cantina rooms are a closed web app, not
  a livekit room an outside participant can join.
- the live url / OBS path dead-ends too: there is no way to feed her camera
  page into a cantina room.
- browserbase (the fallback for join engines on unsupported platforms) can
  drive the cantina web app from a cloud browser, but publishing prixie's
  camera and mic into a third-party web app is fragile DOM work and squarely
  in ToS-question territory for a closed platform.

so the right next move is outreach, not automation. contact cantina about a
guest avatar / bot participant path (devrel or partnerships). the pitch
writes itself from their own product: cantina rooms already host AI
characters; an api that lets an external agent join as a rendered participant
(publishing an mp4/webm camera track and mic, subscribing to room audio)
would let proxy agents like prixie drop in. if they expose livekit or
web rtc under the hood, the video branch handoff (audio track + video track
from one masky render) plugs straight into it. until then, cantina stays off
the supported platform list and does not get the browserbase treatment: a
broken bot in a social room costs more than it earns.

## gotchas found live

- /conversations 400s without avatarOwnerUserId even though the api reference example omits it. the client passes it.
- turn status on the by-slug read can be "video" (not just pending/ready/error) while videoUrl is already populated: check videoUrl, not the status string, for doneness.
- media urls on the by-slug read are re-signed per fetch (1h ttl): do not cache them long.
