# socmed: prixie as an internet personality

the video branch renders 16:9 for calls. this branch is the same pipeline
pointed at the feed: reels, stories, tiktok, pins, carousel cards. she has a
face, a room, a light recipe and a lens; posting is the natural next surface,
and the whole point is that nothing about the set changes to get there.

## what the branch is

one authored set, every channel. the sizing is proskena's, taken from its
socmed work rather than invented twice:

- the export presets mirror `EXPORT_SIZES` in proskena's
  `socmed/95-captures.js` verbatim: square 1:1 (1080), portrait 4:5
  (1080x1350), vertical 9:16 (1080x1920), wide 16:9 (1920x1080). to those the
  branch adds the call target (16:9, 1280x720, the video branch's default)
  and pinterest's standard pin (2:3, 1000x1500).
- the platform facts come from proskena's `socmed/platform-reference.md`,
  checked 2026-10-12 against 2026 sources: tiktok and instagram reels/stories
  are 9:16 with roughly 14 percent ui bands top and bottom, instagram and
  facebook feeds are 4:5 portrait (3:4 also native on instagram), pinterest
  pins are 2:3. re-verify before any pass that depends on a specific number;
  platforms change these without notice.

`server/sizes.ts` is the whole module. aspect is a render-time value, not a
redesign: the same pinned camera renders into any target ratio, and only the
crop changes.

## the safe zone

the one place sizing changes framing rather than pixels: on a 9:16 vertical,
the top and bottom 14 percent get covered by platform ui, so her head clears
the top band and her figure fits between the bands
(`placementInSafeZone`). the shot is still proskena's lens; only the crop is
socmed's. other ratios have no bands and the lens's framing stands.

## one bug this branch caught

the matte used to stretch to the raw frame while the person sat at her placed
position, so the alpha stopped describing her the moment a placement moved
her, and alphamerge turned the disagreement into opaque black bands. fixed:
the matte rides the person's exact framing chain (same scale, same pad, same
width cap, `framingFilters` in `server/composite.ts`), and a vertical frame
caps her width to the frame (the cap is a no-op when she already fits).
verified on real renders: 9:16 and 16:9 both composite clean, plate at the
bands, person in the frame, no black.

## what this branch does not do

the pipeline renders; it does not publish. attribution, captions, links and
posting stay with the creator, the same way proskena's captures work: the
studio never knows a channel exists. posting connectors, cadence, captioning
from the persona's voice profile, all parked until the owner calls for them.
