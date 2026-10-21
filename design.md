# video design

## what this is

prixie's camera presence. the join engine on main joins with camera off by default. video is the optional layer that replaces the black square with a talking avatar from masky.ai.

## the hard problem

the avatar has to track her voice in real time. a meeting is not a clip you render once. the open questions are:

- clip-based or streaming: does masky.ai render per utterance (clip-based, easier, adds latency between utterances) or can it drive a live face (harder, no gap)
- publishing: a rendered avatar has to reach the platform as a camera track. livekit can publish a video track (that part belongs to yap); the join engine on main joins through a headless browser, so the avatar has to get into the web client's camera device. browserbase does support fake video inputs, this is the seam to figure out.
- persona faces: the profile system on main has personas. video should let each persona wear its own face (AvatarRequest.personaRef).

## order of work

1. api key + docs land, fill in the client (server/masky.ts)
2. clip-based generation from a finished TTS utterance (accept the gap)
3. close the gap: overlap next-clip generation with the current one
4. wire the output into the meeting as her camera
