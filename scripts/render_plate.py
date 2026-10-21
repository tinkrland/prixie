#!/usr/bin/env python3
"""render a plate from a 3d set file through the pinned camera. the background
and the props are all 3d (assets/sets/*.glb from scripts/build_sets.py); this
renders them. proskena's studio renderer remains the authored path; this is
the same math headless, so the plate and the person projection agree by
construction: one pinhole, scene.ts's.

spec (json file):
{
  "set": "assets/sets/white_studio.glb",
  "out": "/tmp/plate.png",
  "frame": {"width": 1280, "height": 720},
  "camera": {"position": [0,1.35,1.9], "lookAt": [0,1.35,0], "fov": 32},
  "bg": [24,24,24],
  "ambient": 0.45,
  "lights": [
    {"color": [1,0.96,0.9], "intensity": 3.0, "azimuth": 40, "elevation": 55},
    ...
  ]
}

azimuth/elevation match server/set.ts's light recipes. pure cpu numpy, no
webgl, no deps beyond trimesh + pillow.

run: python3 scripts/render_plate.py spec.json
"""

import json
import math
import sys

import numpy as np
import trimesh
from PIL import Image


def light_dir(az, el):
    """unit vector FROM the subject TOWARD the light. azimuth 0 = the camera
    side (+z), rotating toward +x; elevation 0 = horizontal."""
    az, el = math.radians(az), math.radians(el)
    return np.array([
        math.sin(az) * math.cos(el),
        math.sin(el),
        math.cos(az) * math.cos(el),
    ])


def world_meshes(scene):
    # nodes_geometry: node names that carry geometry, so the graph lookup works
    for node in scene.graph.nodes_geometry:
        transform, geom_name = scene.graph[node]
        m = scene.geometry[geom_name].copy()
        m.apply_transform(transform)
        yield m


def mesh_material(mesh):
    base = np.array([200, 200, 200], dtype=float)
    emissive = np.zeros(3)
    try:
        mat = mesh.visual.material
        f = getattr(mat, "baseColorFactor", None)
        if f is not None:
            f = np.array(f, dtype=float)
            base = f[:3] / 255.0 if f[:3].max() > 1.001 else f[:3]
        e = getattr(mat, "emissiveFactor", None)
        if e is not None:
            e = np.array(e, dtype=float)
            emissive = e / 255.0 if e.max() > 1.001 else e
    except Exception:
        pass
    return base, emissive


def render(spec):
    W, H = spec["frame"]["width"], spec["frame"]["height"]
    cam = spec["camera"]
    pos = np.array(cam["position"], dtype=float)
    look = np.array(cam["lookAt"], dtype=float)
    fov = float(cam["fov"])
    focal = (H / 2) / math.tan(math.radians(fov) / 2)
    forward = look - pos
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, [0, 1, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)

    img = np.tile(np.array(spec["bg"], dtype=float), (H, W, 1))
    zbuf = np.full((H, W), np.inf)

    # studio rig: each light sits at rig radius from the subject, inverse
    # square falloff normalized AT the subject (the proskena intensities are
    # tuned for a rigged studio, not a sun)
    RIG = 4.5
    lights = []
    for l in spec["lights"]:
        direction = light_dir(float(l["azimuth"]), float(l["elevation"]))
        lights.append((
            np.array(l["color"], dtype=float),
            float(l["intensity"]),
            direction,
            direction * RIG,  # position
        ))
    ambient = float(spec["ambient"])
    EXPOSURE = 0.42

    def att(pos_l, pts):
        d = np.linalg.norm(pts - pos_l, axis=1)
        return np.clip((RIG * RIG) / (d * d), 0.0, 1.0)

    scene = trimesh.load(spec["set"])
    for mesh in world_meshes(scene):
        v = np.asarray(mesh.vertices, dtype=float)
        f = np.asarray(mesh.faces, dtype=int)
        base, emissive = mesh_material(mesh)
        # world -> camera space (same axes as scene.ts)
        d = v - pos
        xc, yc, zc = d @ right, d @ up, d @ forward
        sx = W / 2 + focal * xc / zc
        sy = H / 2 - focal * yc / zc
        pts = np.stack([sx, sy], axis=1)
        tri = pts[f]  # (T, 3, 2)
        world3 = v[f]  # (T, 3, 3)
        n = np.cross(world3[:, 1] - world3[:, 0], world3[:, 2] - world3[:, 0])
        norm = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.where(norm == 0, 1, norm)
        # two-sided shading; flip normals that face away from the camera
        center = world3.mean(axis=1)
        to_cam = pos - center
        flip = ((n * to_cam).sum(axis=1)) < 0
        n[flip] *= -1
        depth = zc[f].mean(axis=1)
        centers = world3.mean(axis=1)
        atts = [att(pos_l, centers) for _, _, _, pos_l in lights]
        for t in range(len(f)):
            # geometry behind the lens explodes across the frame; sets are
            # authored to stop before the camera, and this culls anything that
            # does not
            if zc[f[t]].min() < 0.05:
                continue
            p0, p1, p2 = tri[t]
            x0, x1 = int(max(math.floor(min(p0[0], p1[0], p2[0])), 0)), \
                int(min(math.ceil(max(p0[0], p1[0], p2[0])), W))
            y0, y1 = int(max(math.floor(min(p0[1], p1[1], p2[1])), 0)), \
                int(min(math.ceil(max(p0[1], p1[1], p2[1])), H))
            if x0 >= x1 or y0 >= y1:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
            # textbook edge functions, each anchored at its own edge
            e01 = (p1[0] - p0[0]) * (ys - p0[1]) - (p1[1] - p0[1]) * (xs - p0[0])
            e12 = (p2[0] - p1[0]) * (ys - p1[1]) - (p2[1] - p1[1]) * (xs - p1[0])
            e20 = (p0[0] - p2[0]) * (ys - p2[1]) - (p0[1] - p2[1]) * (xs - p2[0])
            mask = ((e01 >= 0) & (e12 >= 0) & (e20 >= 0)) | \
                ((e01 <= 0) & (e12 <= 0) & (e20 <= 0))
            # barycentric z interpolation
            tot = e01 + e12 + e20
            tot = np.where(np.abs(tot) < 1e-9, 1.0, tot)
            z0, z1, z2 = zc[f[t]]
            z = (e12 * z0 + e20 * z1 + e01 * z2) / tot
            zb = zbuf[y0:y1, x0:x1]
            paint = mask & (z < zb)
            if not paint.any():
                continue
            nt = n[t]
            shade = np.zeros(3)
            for li, (color, intensity, direction, _) in enumerate(lights):
                ndl = max(0.0, float(nt @ direction))
                shade = shade + color * (intensity * ndl * atts[li][t])
            c = base * ((shade + ambient) * EXPOSURE) + base * emissive
            # soft shoulder above 1: keeps midtones linear, rolls the hot end
            over = np.maximum(0.0, c - 1.0)
            c = c / (1.0 + over)
            col = np.clip(c, 0, 1) * 255
            region = img[y0:y1, x0:x1]
            region[paint] = col
            zbuf[y0:y1, x0:x1][paint] = z[paint]

    out = Image.fromarray(img.astype(np.uint8))
    out.save(spec["out"])
    return out.size


def main():
    with open(sys.argv[1]) as fh:
        spec = json.load(fh)
    size = render(spec)
    print(f"plate rendered: {spec['out']} {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
