#!/usr/bin/env python3
"""author the sets as 3d files. the background and the props are all 3d,
that is the point: not painted plates, not backdrops, 3d files that a camera
renders. assets/sets/*.glb are the outputs; this script is the source of truth
so they are reproducible.

coordinates match server/scene.ts (metres, y up, the camera looks toward -z).

run: python3 scripts/build_sets.py
"""

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

OUT_DIR = "assets/sets"


def mat(base, emissive=None, rough=0.95, metal=0.0):
    base = [c / 255.0 for c in base] + [1.0]
    return TextureVisuals(material=PBRMaterial(
        baseColorFactor=base,
        emissiveFactor=(emissive if emissive is not None else [0.0, 0.0, 0.0]),
        roughnessFactor=rough,
        metallicFactor=metal,
    ))


def pbr(mesh, material):
    mesh.visual = material
    return mesh


def box(size, center, material):
    m = trimesh.creation.box(extents=size)
    m.apply_translation(center)
    return pbr(m, material)


def white_cyc():
    """the white background render's set: a white cyclorama, the studio look.
    one swept grid: back wall curving into the floor, so the wall-floor seam
    disappears the way it does on a real cyc."""
    # profile in (z, y): wall top -> arc -> floor
    prof = []
    prof.append((-3.0, 3.0))
    prof.append((-3.0, 0.5))
    # quarter pipe: center (-2.5, 0.5), from the wall (180 deg) to the
    # floor (270 deg). theta runs 180->270, sweeping the right direction
    r = 0.5
    for theta in np.linspace(np.pi, 1.5 * np.pi, 9)[1:]:
        prof.append((-2.5 + r * np.cos(theta), 0.5 + r * np.sin(theta)))
    prof.append((1.0, 0.0))  # the floor ends before the camera (z = 1.9)
    prof = np.array(prof)
    xs = np.linspace(-4.0, 4.0, 17)
    verts, faces = [], []
    for i, x in enumerate(xs):
        for j, (z, y) in enumerate(prof):
            verts.append((x, y, z))
    verts = np.array(verts)
    n_x, n_y = len(xs), len(prof)
    for i in range(n_x - 1):
        for j in range(n_y - 1):
            a = i * n_y + j
            b = a + n_y
            faces.append((a, b, b + 1))
            faces.append((a, b + 1, a + 1))
    cyc = trimesh.Trimesh(vertices=verts, faces=np.array(faces), process=False)
    # wind normals toward +z (the camera side) and up
    cyc.fix_normals()
    white = mat([246, 246, 244])
    scene = trimesh.Scene({"cyc": pbr(cyc, white)})
    for sx in (-4.0, 4.0):
        wall = box((0.1, 3.0, 6.0), (sx, 1.5, 0.0), mat([240, 240, 238]))
        scene.add_geometry(wall, node_name=f"side_{sx}")
    return scene


def room_set():
    """the room: floor, walls, a window, a shelf with props, a plant, a rug.
    every one of these is a 3d file component, rendered by the camera."""
    warm_wall = mat([225, 217, 204])
    floor_m = mat([196, 175, 150])
    scene = trimesh.Scene({
        "floor": box((8.0, 0.1, 4.8), (0, -0.05, -0.6), floor_m),  # ends at z = 1.8, before the lens
        "back_wall": box((8.0, 3.0, 0.1), (0, 1.5, -3.05), warm_wall),
        "right_wall": box((0.1, 3.0, 6.0), (3.05, 1.5, 0.0), mat([212, 202, 187])),
        "left_wall": box((0.1, 3.0, 6.0), (-3.05, 1.5, 0.0), warm_wall),
        "window": box((1.5, 1.2, 0.06), (1.85, 1.7, -2.94),
                      mat([248, 245, 235], emissive=[1.35, 1.32, 1.22])),
        "shelf": box((1.6, 0.07, 0.55), (-1.8, 1.41, -2.7), mat([148, 120, 94])),
        "book_red": box((0.2, 0.34, 0.4), (-2.3, 1.62, -2.7), mat([162, 62, 52])),
        "book_blue": box((0.2, 0.34, 0.4), (-2.05, 1.62, -2.7), mat([72, 92, 142])),
        "rug": box((2.4, 0.02, 2.1), (0, 0.01, -0.15), mat([178, 118, 108])),
    })
    pot = trimesh.creation.cylinder(radius=0.12, height=0.25)
    pot.apply_translation((-1.4, 0.125, -2.7))
    scene.add_geometry(pbr(pot, mat([150, 100, 70])), node_name="pot")
    head = trimesh.creation.icosphere(radius=0.2, subdivisions=2)
    head.apply_translation((-1.4, 0.55, -2.7))
    scene.add_geometry(pbr(head, mat([64, 112, 78])), node_name="plant")
    return scene


def main():
    import os
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, scene in [("white_studio", white_cyc()), ("room", room_set())]:
        path = f"{OUT_DIR}/{name}.glb"
        scene.export(path)
        check = trimesh.load(path)
        n = len(check.geometry)
        print(f"{path}: {n} geometries")
        assert n >= 2, "the glb lost geometry on roundtrip"


if __name__ == "__main__":
    main()
