# props/kits

the furniture kits used for set design, vendored as-is from room-main
(flo-bit's bluesky-house). each model is a plain glb: meshes in scene-graph
order, one material slot per mesh, painted per slot by the room spec's
colors array (see scripts/render_plate.py, load_kit_prop).

kits and licenses:
- kaykit-furniture-kit by Kay Lousberg (kaylousberg.itch.io), CC0
- kenney-furniture-kit by Kenney (kenney.nl), CC0
- tiny-treats-bubbly-bathroom (plant), from room-main's bundled kits, CC0

catalog math (ported from room-main/src/lib/room/models.ts): kaykit and
tiny-treats models load at scale 0.4, kenney at 1.0. a room spec object is
{ kind, position (meters), rotation (radians), colors (hex per slot),
placement: floor | wallX | wallZ }.
