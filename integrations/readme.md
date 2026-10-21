# integrations

the places prixie's stream goes. the obs bridge (obs.ts) is protocol-pure:
obs-websocket 5.x, scenes, sources, stream on/off. a platform is just an
rtmp destination, so each platform is one small file:

- `obs.ts` — the bridge itself, platform-agnostic. `setStreamTarget(server,
  key)` is the single seam every target uses.
- `twitch.ts` — the stable public ingest (rtmp://live.twitch.tv/app) + key
  from the creator dashboard.
- `kick.ts` — kick's ingest url + key from ITS creator dashboard, read from
  env (`KICK_STREAM_URL`, `KICK_STREAM_KEY`) because kick's ingest is not one
  stable public constant. kick has no mature public api for chat or channel
  info, and nothing here pretends otherwise.

adding a platform means adding one file with a `StreamTarget` and a
point-at function. no bridge changes, no platform lock-in: the same rule as
everywhere else in prixie, ours and not the platform's.

stream keys are credentials: environment or obs's own settings, never this
repo.
