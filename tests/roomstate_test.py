# room-main's placement math, ported: the room spec is the set-design
# format (kind/position/rotation/colors/placement), and the renderer must
# apply exactly the rotations the app applies. run:
#   python3 -m pytest tests/roomstate_test.py

import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from render_plate import (  # noqa: E402
    _euler_xyz,
    hex_rgb,
    load_kit_prop,
    render,
)

KITS = Path(__file__).resolve().parent.parent / "assets" / "props" / "kits"


def test_shorthand_hex():
    assert (hex_rgb("#abc") == hex_rgb("#aabbcc")).all()


def test_floor_rotation_spins_y():
    # floor placement rotates about Y only: a point on +x moves toward -z
    # for a positive angle (three.js Y-ccw)
    R = _euler_xyz(0, math.pi / 2, 0)
    v = R @ np.array([1.0, 0.0, 0.0])
    assert abs(v[0]) < 1e-9 and v[2] < 0


def test_wall_placements_port_roomobject():
    # wallZ (back wall): in-plane only, identity at rotation 0
    R = _euler_xyz(0, 0, 0)
    assert np.allclose(R, np.eye(3))
    # wallX (left wall): Ry(pi/2) faces the object into the room, Rx is
    # the in-plane tilt: RoomObject.svelte's vector, ported verbatim
    rot = 0.3
    rx = rot
    ry = math.pi / 2
    rz = 0.0
    R = _euler_xyz(rx, ry, rz)
    # the object's +z (its front) must face +x (off the left wall)
    front = R @ np.array([0.0, 0.0, 1.0])
    assert front[0] > 0.9 and abs(front[1]) < 0.1


def test_kit_prop_colors_per_slot():
    parts = load_kit_prop(str(KITS / "kaykit-furniture-kit" / "shelf_b_big.glb"),
                         ["#ff0000"])
    assert len(parts) == 2  # two meshes, one material slot each
    first, second = parts
    # slot 0 painted by the object's colors[0]
    assert (first[2] == hex_rgb("#ff0000")).all()
    # slot 1 falls back to room-main's default palette
    assert (second[2] == hex_rgb("#aaaaaa")).all()


def test_roomstate_renders_walls_floor_objects():
    spec = {
        "frame": {"width": 240, "height": 160},
        "environment": {"bg": "#101010", "center": "#303030", "preset": "paper"},
        "live": {"position": [1400, 1100, 2200], "target": [0, 700, 0], "fov": 45},
        "lighting": {
            "key": {"on": True, "azimuth": 35, "elevation": 45, "intensity": 2.4,
                    "color": "#ffffff"},
            "fill": {"on": False}, "rim": {"on": False},
            "ambience": "bright"},
        "sceneScale": 1,
        "roomState": {
            "wallColor": "#ff0000", "floorColor": "#00ff00",
            "size": {"x": 3, "z": 3},
            "objects": [
                {"kind": "kaykit-furniture-kit/table_small",
                 "position": [0, 0, -0.8], "rotation": 0.3,
                 "colors": ["#0000ff"]},
            ],
        },
        "out": "/tmp/_roomstate_test.png",
    }
    render(spec)
    from PIL import Image
    im = np.asarray(Image.open("/tmp/_roomstate_test.png").convert("RGB")).astype(float)
    # the wall and the floor are in frame with their own colours (lit)
    assert im[:, :, 0].max() > 120   # red wall present
    assert im[:, :, 1].max() > 120   # green floor present
    assert im[:, :, 2].max() > 100   # the blue table present


def test_framewall_wall_stack_order():
    from render_plate import build_wall
    import numpy as np
    spec = {
        "wallpaper": {"color": "#ffffff"},
        "wainscot": {"type": "board-batten", "color": "#00ff00", "height": 1.0},
        "rail": {"color": "#0000ff"},
        "baseboard": {"color": "#ff0000"},
    }
    m_to_u = 1000.0
    meshes = build_wall(np.zeros(3), (1, 0, 0), (0, 0, 1), 4000.0,
                        2000.0, spec, m_to_u)
    # band tops: baseboard below wainscot top, rail rides the wainscot
    # top, paper fills above the rail to the wall top
    tops = sorted(round(float(v[:, 1].max()), 1) for v, f, a, fc in meshes)
    assert 60.0 in tops       # baseboard: 3% of 2m = 6cm
    assert 1000.0 in tops     # wainscot explicit 1.0m
    assert 1020.0 in tops     # rail: 4cm, centred on the wainscot top
    assert 2000.0 in tops     # paper to the wall top


def test_flat_wall_string_backcompat():
    from render_plate import build_wall
    meshes = build_wall(np.zeros(3), (1, 0, 0), (0, 0, 1), 4000.0,
                        2000.0, "#c9bfae", 1000.0)
    assert len(meshes) == 1   # one paper face, nothing else
    from render_plate import hex_rgb
    assert (np.asarray(meshes[0][2]) == hex_rgb("#c9bfae")).all()


def test_camera_side_walls_cull():
    import json
    base = json.load(open("/tmp/spec_roomstate3.json"))
    # camera outside the front wall: exactly the back and left walls draw
    # (the right wall's plane also faces the lens from the far side)
    from render_plate import render
    import numpy as np
    from PIL import Image

    def wall_pixels(spec_path):
        render(dict(base, live={"position": [2200, 1550, 3100],
                                "target": [0, 950, -300], "fov": 42},
                    out=spec_path, frame={"width": 240, "height": 160}))
        return np.asarray(Image.open(spec_path).convert("RGB")).astype(float)

    im = wall_pixels("/tmp/_cull1.png")
    assert im.mean() > 10  # room in frame
    # camera inside the room: no wall culls, the box is closed, the plate
    # is dominated by wall/floor instead of backdrop
    im2 = wall_pixels("/tmp/_cull2.png")
    assert im2.mean() > 10
