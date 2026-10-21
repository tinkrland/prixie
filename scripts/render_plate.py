#!/usr/bin/env python3
"""render a plate from a proskena scene state. proskena's 3d system is the
system that exists and this renders IT: the same scene state schema
(proskena-scene-state), the same backdrop (a gradient plane, bg + center
lift), the same prop library (authored placeholder geometry, placed as scene
objects at x/z/rotY/scale), the same light rig (key/fill/rim directionals at
azimuth/elevation plus hemispheric ambience), the same camera (live position
+ target + fov). proskena's studio renderer stays the authored path; this is
its math headless so prixie's plate is the scene proskena describes.

the subject (the bust, the hand) is optional: prixie's person replaces it,
so composite plates render subject: null. the white background is
proskena's own: the paper backdrop preset (bg + center lift values).

spec (json file):
{
  "schema": "proskena-scene-state",
  "live": {"position": [140,260,460], "target": [-15,100,40], "fov": 26},
  "environment": {"bg": "#8f887c", "center": "#cfc8bd"},
  "props": [{"prop": "ottoman", "x": -230, "z": -260, "rotY": 20, "scale": 1}],
  "lighting": {"ambience": "bright", "key": {...}, "fill": {...}, "rim": {...}},
  "sceneScale": 1,          // 1 = proskena's stage (hand scale); prixie's
                            // person stage is 10.5 (metres x 1000 / proskena's
                            // ~105mm-per-unit subject scale)
  "subject": null,          // or a glb path (proskena's bust/hand models)
  "frame": {"width": 1280, "height": 720},
  "out": "/tmp/plate.png",
  "bg": [24, 24, 24]        // only visible beyond geometry
}

run: python3 scripts/render_plate.py spec.json
"""

import json
import math
import sys

import numpy as np
import trimesh
from PIL import Image

# ===== proskena's constants, verbatim from the repo =====
BACKDROP_SIZE = (2400, 1700)
BACKDROP_POS = (0, 260, -620)
CANVAS = (512, 400)          # the gradient canvas size
GRAD_CENTER = (256, 168)
GRAD_RADII = (30, 340)
LIGHT_DIST = 620             # where directionals sit; no falloff (DirectionalLight)
HEMI_SKY = (0xf5, 0xef, 0xe6)
HEMI_GROUND = (0x3a, 0x36, 0x30)
AMBIENCE = {"bright": 0.95, "dim": 0.45, "dark": 0.16}


def hex_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:  # css shorthand: #abc = #aabbcc
        h = "".join(c * 2 for c in h)
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def srgb_to_linear(c):
    c = np.asarray(c, dtype=float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


# ===== the prop library, ported verbatim from proskena's setdesign =====
def prop_mat(color):
    """proskena writes prop colors as 0x hex ints (0x9a8578)"""
    return np.array([(color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF], dtype=float)


def cyl_mesh(r_top, r_bot, h, seg, color):
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    verts = []
    for a in ang:
        verts.append((r_bot * math.cos(a), 0, r_bot * math.sin(a)))
    for a in ang:
        verts.append((r_top * math.cos(a), h, r_top * math.sin(a)))
    faces = []
    for i in range(seg):
        j = (i + 1) % seg
        faces.append((i, j, seg + i))
        faces.append((j, seg + j, seg + i))
        faces.append((i, seg + i, seg + (i - 1) % seg))  # rim fan
    return np.array(verts), np.array(faces), color


def box_mesh(w, h, d, color):
    # 8 corners, 12 tris
    c = [(x, y, z) for x in (-w / 2, w / 2) for y in (0, h) for z in (-d / 2, d / 2)]
    idx = lambda i, j, k: (i, j, k)
    quads = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    faces = []
    for a, b, d2, e in quads:
        faces.append(idx(a, b, d2))
        faces.append(idx(a, d2, e))
    return np.array(c, dtype=float), np.array(faces), color


def lathe_mesh(profile, seg, color):
    """profile: [(radius, y)] -> a surface of revolution"""
    n = len(profile)
    ang = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    verts = []
    for a in ang:
        for r, y in profile:
            verts.append((r * math.cos(a), y, r * math.sin(a)))
    faces = []
    for i in range(seg):
        j = (i + 1) % seg
        for k in range(n - 1):
            a0, b0 = i * n + k, i * n + k + 1
            a1, b1 = j * n + k, j * n + k + 1
            faces.append((a0, a1, b1))
            faces.append((a0, b1, b0))
    return np.array(verts, dtype=float), np.array(faces), color


def torus_mesh(r, tube, seg, tseg, color):
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            verts.append(((r + tube * math.cos(b)) * math.cos(a), tube * math.sin(b),
                          (r + tube * math.cos(b)) * math.sin(a)))
    for i in range(seg):
        for j in range(tseg):
            a0 = i * tseg + j
            b0 = ((i + 1) % seg) * tseg + j
            a1 = i * tseg + (j + 1) % tseg
            b1 = ((i + 1) % seg) * tseg + (j + 1) % tseg
            faces.append((a0, b0, b1))
            faces.append((a0, b1, a1))
    return np.array(verts, dtype=float), np.array(faces), color


def build_ottoman():
    parts = []
    v, f, col = cyl_mesh(150, 158, 95, 28, prop_mat(0x9a8578))
    parts.append((v + [0, 115, 0], f, col))
    v, f, col = cyl_mesh(120, 132, 70, 28, prop_mat(0x54473e))
    parts.append((v + [0, 35, 0], f, col))
    return parts


def build_mug():
    parts = []
    v, f, col = cyl_mesh(42, 38, 95, 24, prop_mat(0xe4d8c3))
    parts.append((v + [0, 48, 0], f, col))
    v, f, col = torus_mesh(26, 8, 18, 10, prop_mat(0xe4d8c3))
    w = v + [46, 50, 0]
    # proskena rotates the handle to face sideways (rotation.y = pi/2): swap x/z
    parts.append((w[:, [2, 1, 0]], f, col))
    return parts


def build_books():
    parts = []
    cols = [0x7d6b60, 0x6b7561, 0x8c7f8e]
    y = 0
    tilt = 0.06
    for i in range(3):
        v, f, col = box_mesh(210, 38, 145, prop_mat(cols[i]))
        v = v + [6 * (1 if i % 2 else -1), y, 0]
        # rotation.y = tilt * (i - 1)
        a = tilt * (i - 1)
        rot = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
        parts.append((v @ rot.T + [0, y + 19 - 19, 0], f, col))
        y += 38
        tilt += 0.05
    # the box builder has y in [0, h]; proskena centers the book at y + 19
    return parts


def build_vase():
    pts = []
    for i in range(11):
        t = i / 10
        r = 40 + 55 * math.sin(t * math.pi * 0.9) * (1 - t * 0.35)
        pts.append((r, t * 230))
    v, f, col = lathe_mesh(pts, 26, prop_mat(0x86929b))
    return [(v, f, col)]


PROP_LIBRARY = {
    "ottoman": build_ottoman,
    "mug": build_mug,
    "books": build_books,
    "vase": build_vase,
}


def transform(mesh, scale, rot_y, pos):
    v, f, col = mesh
    a = math.radians(rot_y)
    rot = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    return (v @ rot.T * scale + pos, f, col)


def backdrop_mesh(env, scene_scale):
    """proskena's backdrop: a plane whose material is the radial gradient
    (center lift -> bg). unlit. ported from 42-backdrops.js."""
    W, H = BACKDROP_SIZE[0] * scene_scale, BACKDROP_SIZE[1] * scene_scale
    cx, cy, cz = [c * scene_scale for c in BACKDROP_POS]
    bg, center = hex_rgb(env["bg"]), hex_rgb(env["center"])
    NX, NY = 40, 28
    verts, faces, colors = [], [], []
    for iy in range(NY + 1):
        for ix in range(NX + 1):
            x = (ix / NX - 0.5) * W
            y = (iy / NY - 0.5) * H
            verts.append((x + cx, y + cy, cz))
    for iy in range(NY):
        for ix in range(NX):
            a = iy * (NX + 1) + ix
            b = a + NX + 1
            faces.append((a, b, b + 1))
            faces.append((a, b + 1, a + 1))
            # gradient in canvas space (512x400), like the repo's canvas
            mx, my = ((ix + 0.5) / NX - 0.5) * W + cx, ((iy + 0.5) / NY - 0.5) * H + cy
            u = (mx - cx) / W * CANVAS[0] + CANVAS[0] / 2
            v = (cy - my) / H * CANVAS[1] + CANVAS[1] / 2
            r = math.hypot(u - GRAD_CENTER[0], v - GRAD_CENTER[1])
            t = min(max((r - GRAD_RADII[0]) / (GRAD_RADII[1] - GRAD_RADII[0]), 0), 1)
            col = center * (1 - t) + bg * t
            colors.append(col)
            colors.append(col)
    return np.array(verts), np.array(faces), None, np.array(colors)  # unlit


def floor_mesh(color, span=4000.0):
    """the floor under a room: one quad at y=0, centre x/z at 0"""
    h = span / 2
    v = np.array([[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h]], dtype=float)
    f = np.array([[0, 2, 1], [0, 3, 2]], dtype=int)
    return v, f, np.tile(srgb_to_linear(hex_rgb(color)) * 255, (2, 1))


def load_room(path, vox_mm, origin=(0.0, 0.0, 0.0)):
    """the lowpoly room (scripts/vox_room.py): a rooms.xyz room walked through
    marching cubes and quadric decimation. floor at y=0, centre x/z at 0.
    face colours are the room's own palette with baked crease AO, and they
    are LIT by the rig (albedo=None says so)."""
    d = np.load(path)
    v = np.asarray(d["verts"], dtype=float) * vox_mm
    f = np.asarray(d["faces"], dtype=int)
    fc = np.asarray(d["face_colors"], dtype=float)
    v[:, 0] += origin[0]
    v[:, 1] += origin[1]
    v[:, 2] += origin[2]
    return (v, f, "lit", fc)


# room-main's placement math (src/lib/room/models.ts, RoomObject.svelte),
# ported: kit models load at their catalog scale, meshes are painted per
# material slot by the object's colors array, falling back to room-main's
# default palette. the plate rasterizer is the renderer; nothing else.
KIT_SCALES = {
    "kaykit-furniture-kit": 0.4,
    "kenney-furniture-kit": 1.0,
    "tiny-treats-bubbly-bathroom": 0.4,
}
DEFAULT_PROP_PALETTE = ["#ffffff", "#aaaaaa", "#555555", "#333333"]
PROPS_DIR = "assets/props"


def _euler_xyz(rx, ry, rz):
    """three.js Euler order XYZ: R = Rx @ Ry @ Rz (z applied first)"""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def load_kit_prop(path, colors=None):
    """a kit model: meshes in scene-graph order, one material slot each.
    colors[i] (hex string) paints slot i, falling back to room-main's
    default palette. the model's own baseColorFactor is ignored, exactly
    like the app's RoomObjectMaterial."""
    import trimesh
    scene = trimesh.load(path)
    out = []
    palette = list(DEFAULT_PROP_PALETTE)
    if colors:
        for i, c in enumerate(colors):
            if c:
                palette[i] = c
    nodes = list(scene.graph.nodes_geometry)
    # the kits were split out of one big scene, so every mesh of a model
    # carries that scene's layout offset. parts keep their offsets
    # RELATIVE to the model's first node: kaykit's shared offset cancels
    # (their parts stay aligned), and a kenney desk's drawers keep the
    # local offsets that actually place them.
    base = scene.graph[nodes[0]][0][:3, 3] if nodes else np.zeros(3)
    for i, node in enumerate(nodes):
        T, geom_name = scene.graph[node]
        m = scene.geometry[geom_name].copy()
        v = np.asarray(m.vertices, dtype=float) + (T[:3, 3] - base)
        f = np.asarray(m.faces, dtype=int)
        col = hex_rgb(palette[i % len(palette)])
        out.append((v, f, col))
    return out


def load_glb_prop(path, face_cap=24000, units="m"):
    """a scanned/modeled prop glb with vertex colors: proskena's parametric
    props are boxes with a base color; props like this carry their own
    colour on the vertices, so the loader reads COLOR_0 and lights the
    result like the room's palette faces. the rasterizer shades per face,
    so the mesh is decimated to face_cap first, and the vertex colours are
    transferred through the decimation by nearest lookup on the original:
    a decimated mesh keeps its shape, it must not lose its paint.
    units: proskena is mm; a glb from a scan/model tool is meters, so the
    mesh is scaled to proskena's units here, once."""
    import trimesh
    from scipy.spatial import cKDTree

    scene = trimesh.load(path)
    out = []
    geoms = []
    for node in scene.graph.nodes_geometry:
        T, geom_name = scene.graph[node]
        m = scene.geometry[geom_name].copy()
        m.apply_transform(T)
        geoms.append(m)
    for m in geoms:
        raw_v = np.asarray(m.vertices, dtype=float)
        vc = None
        try:
            raw = np.asarray(m.visual.vertex_colors)  # (n, 4) rgba
            vc = raw[:, :3].astype(float)
        except Exception:
            pass
        f = np.asarray(m.faces, dtype=int)
        if vc is None:
            # flat colour from the material, like the subject loader
            try:
                base = np.asarray(m.visual.material.baseColorFactor[:3], float)
                base = base / 255.0 if base.max() > 1.001 else base
                vc = np.tile(base, (len(raw_v), 1)) * 255.0
            except Exception:
                vc = np.full((len(raw_v), 3), 200.0)
        scale = 1000.0 if units == "m" else 1.0
        raw_v = raw_v * scale
        # sit the prop on the floor: a scan is often centered on its own
        # origin, and a prop that arrives centered sinks half of itself
        # under the room's floor
        raw_v[:, 1] -= raw_v[:, 1].min()
        if len(f) > face_cap:
            dec = m.simplify_quadric_decimation(face_count=face_cap)
            dv = np.asarray(dec.vertices, dtype=float) * scale
            dv[:, 1] -= np.asarray(m.vertices, dtype=float)[:, 1].min() * scale
            df = np.asarray(dec.faces, dtype=int)
            # nearest vertex of the original carries the colour through
            tree = cKDTree(raw_v)
            _, nearest = tree.query(dv, k=4)
            w = np.array([0.4, 0.25, 0.2, 0.15])  # close neighbours blend scan noise
            dvc = (vc[nearest] * w[None, :, None]).sum(axis=1)
            out.append((dv * scale, df, "lit", dvc[df].mean(axis=1)))
        else:
            out.append((raw_v, f, "lit", vc[f].mean(axis=1)))
    return out


def load_subject(path):
    """proskena's subject models: a glb that already exists in the repo
    (bust.glb, hand.glb). scaled like proskena loads it."""
    scene = trimesh.load(path)
    out = []
    for node in scene.graph.nodes_geometry:
        T, geom_name = scene.graph[node]
        m = scene.geometry[geom_name].copy()
        m.apply_transform(T)
        v = np.asarray(m.vertices, dtype=float)
        f = np.asarray(m.faces, dtype=int)
        try:
            base = np.array(m.visual.material.baseColorFactor[:3], dtype=float)
            base = base / 255.0 if base.max() > 1.001 else base
        except Exception:
            base = np.array([0.8, 0.75, 0.7])
        out.append((v, f, base * 255.0))
    return out


def render(spec):
    W, H = spec["frame"]["width"], spec["frame"]["height"]
    live = spec["live"]
    cam_pos = np.array(live["position"], dtype=float)
    target = np.array(live["target"], dtype=float)
    fov = float(live["fov"])
    scene_scale = float(spec.get("sceneScale", 1))

    focal = (H / 2) / math.tan(math.radians(fov) / 2)
    forward = target - cam_pos
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, [0, 1, 0])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)

    # lights: proskena's rig. directionals have no distance falloff.
    L = spec["lighting"]
    rig = []
    for name in ("key", "fill", "rim"):
        st = L[name]
        if not st.get("on", True):
            continue
        az, el = math.radians(st["azimuth"]), math.radians(st["elevation"])
        direction = np.array([math.sin(az) * math.cos(el), math.sin(el),
                             math.cos(az) * math.cos(el)])
        rig.append((srgb_to_linear(hex_rgb(st["color"])), float(st["intensity"]),
                    direction, direction * LIGHT_DIST * scene_scale))
    amb = AMBIENCE[L["ambience"]]
    sky_l = srgb_to_linear(HEMI_SKY)
    ground_l = srgb_to_linear(HEMI_GROUND)

    meshes = []  # (verts, faces, albedo_rgb, face_colors or None)

    # the set-design format (room-main's math): a box room in meters plus
    # placed objects. a room floats over the backdrop like the app's room
    # floats over the page, so the backdrop renders behind and above it.
    rs = spec.get("roomState")
    if rs:
        sx, sz = float(rs["size"]["x"]), float(rs["size"]["z"])
        m_to_u = 1000.0 * scene_scale
        wall_c = hex_rgb(rs.get("wallColor", "#f1f1f1"))
        floor_c = hex_rgb(rs.get("floorColor", "#a1a1a1"))
        half_x, half_z, h = sx / 2 * m_to_u, sz / 2 * m_to_u, 2.0 * m_to_u
        # floor, back wall (z-, faces +z), left wall (x-, faces +x)
        meshes.append((np.array([[-half_x, 0, -half_z], [half_x, 0, -half_z],
                                  [half_x, 0, half_z], [-half_x, 0, half_z]]),
                       np.array([[0, 2, 1], [0, 3, 2]]), "lit",
                       np.tile(floor_c, (2, 1))))
        meshes.append((np.array([[-half_x, 0, -half_z], [half_x, 0, -half_z],
                                  [half_x, h, -half_z], [-half_x, h, -half_z]]),
                       np.array([[0, 2, 1], [0, 3, 2]]), "lit",
                       np.tile(wall_c, (2, 1))))
        meshes.append((np.array([[-half_x, 0, -half_z], [-half_x, 0, half_z],
                                  [-half_x, h, half_z], [-half_x, h, -half_z]]),
                       np.array([[0, 2, 1], [0, 3, 2]]), "lit",
                       np.tile(wall_c, (2, 1))))
        for obj in rs.get("objects", []):
            kind = obj["kind"]
            placement = obj.get("placement", "floor")
            rot = float(obj.get("rotation", 0))
            pos = np.array(obj.get("position", [0, 0, 0]), dtype=float) * m_to_u
            # RoomObject.svelte's rotation vector, ported verbatim
            rx = rot if placement == "wallX" else 0.0
            ry = (rot if placement == "floor" else 0.0) + \
                (math.pi / 2 if placement == "wallX" else 0.0)
            rz = rot if placement == "wallZ" else 0.0
            R = _euler_xyz(rx, ry, rz)
            if kind.startswith("scan/"):
                parts = load_glb_prop(f"{PROPS_DIR}/{kind[5:]}.glb",
                                      int(obj.get("face_cap", 24000)))
                for v, f, _mode, fc in parts:  # already proskena mm, on floor
                    meshes.append(((R @ v.T).T + pos, f, "lit", fc))
            else:
                kit, model = kind.split("/", 1)
                parts = load_kit_prop(f"{PROPS_DIR}/kits/{kit}/{model}.glb",
                                      obj.get("colors"))
                ks = KIT_SCALES.get(kit, 1.0)
                for v, f, col in parts:
                    v = (R @ (v * ks).T).T * m_to_u + pos
                    meshes.append((v, f, col, None))

    room = spec.get("room")
    if room:
        # the room shell (the editor's base floor/walls) is not model
        # geometry, so the plate adds the floor the room sits on
        meshes.append(load_room(room["mesh"], room.get("vox_mm", 46.0),
                                room.get("origin", (0.0, 0.0, 0.0))))
        span = float(room.get("floor_span", 4000.0))
        fv, ff, fcols = floor_mesh(room.get("floor_color", "#c9b49a"), span)
        meshes.append((fv, ff, None, fcols))
    else:
        # with no vox room the backdrop is the far background: behind and
        # above a roomState box, exactly the page behind the app's room
        bv, bf, _, bcols = backdrop_mesh(spec["environment"], scene_scale)
        meshes.append((bv, bf, None, bcols))

    for p in spec.get("props", []):
        rot_y = p.get("rotY", 0)
        if "glb" in p:
            # a real prop mesh (scan or model): vertex colours, own shape,
            # placed in the room at proskena scale. decimated at load to
            # face_cap, painted through the decimation.
            parts = load_glb_prop(p["glb"], int(p.get("face_cap", 24000)),
                                 p.get("units", "m"))
            pos = np.array([p.get("x", 0), 0, p.get("z", 0)], dtype=float) * scene_scale
            for v, f, mode, fc in parts:
                v = v * float(p.get("scale", 1)) * scene_scale
                a = math.radians(rot_y)
                rot = np.array([[math.cos(a), 0, math.sin(a)],
                                [0, 1, 0],
                                [-math.sin(a), 0, math.cos(a)]])
                meshes.append((v @ rot.T + pos, f, mode, fc))
            continue
        builder = PROP_LIBRARY[p["prop"]]
        scale = p.get("scale", 1) * scene_scale
        pos = np.array([p["x"], 0, p["z"]], dtype=float) * scene_scale
        for part in builder():
            meshes.append(transform(part, scale, rot_y, pos) + (None,))

    if spec.get("subject"):
        subject = load_subject(spec["subject"])
        # place like proskena: scaled to the stage, standing at the origin
        all_v = np.vstack([m[0] for m in subject])
        s = 105.0 * scene_scale / np.abs(all_v[:, 1]).max() * 2.2
        for v, f, col in subject:
            vs = v * s
            vs[:, 1] -= vs[:, 1].min()
            meshes.append((vs, f, col, None))

    # rays that miss the backdrop read as its outer value, never a hole: a
    # plate is the whole background, and a composite cannot have gaps
    fill = np.array(spec.get("bg") or hex_rgb(spec["environment"]["bg"]), dtype=float)
    img = np.tile(fill, (H, W, 1))
    zbuf = np.full((H, W), np.inf)

    for verts, faces, albedo, face_colors in meshes:
        v = np.asarray(verts, dtype=float)
        f = np.asarray(faces, dtype=int)
        if len(f) == 0:
            continue
        d = v - cam_pos
        zc = d @ forward
        sx = W / 2 + focal * (d @ right) / zc
        sy = H / 2 - focal * (d @ up) / zc
        pts = np.stack([sx, sy], axis=1)
        tri = pts[f]
        world3 = v[f]
        n = np.cross(world3[:, 1] - world3[:, 0], world3[:, 2] - world3[:, 0])
        norm = np.linalg.norm(n, axis=1, keepdims=True)
        n = n / np.where(norm == 0, 1, norm)
        center = world3.mean(axis=1)
        to_cam = cam_pos - center
        flip = ((n * to_cam).sum(axis=1)) < 0
        n[flip] *= -1
        for t in range(len(f)):
            if zc[f[t]].min() < 0.05:
                continue
            p0, p1, p2 = tri[t]
            x0 = int(max(math.floor(min(p0[0], p1[0], p2[0])), 0))
            x1 = int(min(math.ceil(max(p0[0], p1[0], p2[0])), W))
            y0 = int(max(math.floor(min(p0[1], p1[1], p2[1])), 0))
            y1 = int(min(math.ceil(max(p0[1], p1[1], p2[1])), H))
            if x0 >= x1 or y0 >= y1:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
            e01 = (p1[0] - p0[0]) * (ys - p0[1]) - (p1[1] - p0[1]) * (xs - p0[0])
            e12 = (p2[0] - p1[0]) * (ys - p1[1]) - (p2[1] - p1[1]) * (xs - p1[0])
            e20 = (p0[0] - p2[0]) * (ys - p2[1]) - (p0[1] - p2[1]) * (xs - p2[0])
            mask = ((e01 >= 0) & (e12 >= 0) & (e20 >= 0)) | \
                ((e01 <= 0) & (e12 <= 0) & (e20 <= 0))
            tot = e01 + e12 + e20
            tot = np.where(np.abs(tot) < 1e-9, 1.0, tot)
            z0, z1, z2 = zc[f[t]]
            z = (e12 * z0 + e20 * z1 + e01 * z2) / tot
            zb = zbuf[y0:y1, x0:x1]
            paint = mask & (z < zb)
            if not paint.any():
                continue
            if face_colors is not None:
                if albedo == "lit" and rig:
                    # lit palette faces (the room): flat lambert per face
                    nt = n[t]
                    shade = np.zeros(3)
                    for color, intensity, direction, _r in rig:
                        ndl = max(0.0, float(nt @ direction))
                        shade = shade + color * (intensity * ndl)
                    w = 0.5 + 0.5 * float(nt[1])
                    shade = shade + (sky_l * w + ground_l * (1 - w)) * amb
                    lit = srgb_to_linear(face_colors[t]) * shade / math.pi
                    col = np.clip(linear_to_srgb(lit), 0, 1) * 255
                else:
                    col = np.clip(face_colors[t], 0, 255)
            else:
                alb = srgb_to_linear(albedo)
                nt = n[t]
                shade = np.zeros(3)
                for color, intensity, direction, _ in rig:
                    ndl = max(0.0, float(nt @ direction))
                    shade = shade + color * (intensity * ndl)
                w = 0.5 + 0.5 * float(nt[1])
                hemi = sky_l * w + ground_l * (1 - w)
                shade = shade + hemi * amb
                c = alb * shade / math.pi  # three.js BRDF_Lambert
                col = np.clip(linear_to_srgb(c), 0, 1) * 255
            region = img[y0:y1, x0:x1]
            region[paint] = col
            zbuf[y0:y1, x0:x1][paint] = z[paint]

    Image.fromarray(img.astype(np.uint8)).save(spec["out"])
    return (W, H)


def main():
    with open(sys.argv[1]) as fh:
        spec = json.load(fh)
    size = render(spec)
    print(f"plate rendered: {spec['out']} {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
