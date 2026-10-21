"""voxel -> lowpoly bridge. run:
  python3 scripts/vox_room.py --vox room.vox --out assets/rooms/detective.npz --preview /tmp/room.png

a rooms.xyz room (via roomtaker) is stacked cubes, and stacked cubes behind a
photoreal person read as lego. the bridge is the standard one: marching cubes
over the occupancy field turn the block pile into a smooth surface, quadric
decimation drops the count to a low-poly budget, and the faces are flat
shaded with the room's own palette colours, darkened by ambient occlusion
baked from the voxel grid (creases between furniture sit darker, which is
what makes a room read as a room). the room keeps its silhouette; nothing
reads as cubes.

the room shell (the editor's base floor/walls) is not model geometry, so it
is not in the vox: the plate adds its own floor plane under the room.

output: one .npz (verts, faces, face_colors, bbox) for render_plate.py.
"""

import argparse
import math
import struct

import numpy as np

# ---------------------------------------------------------------------------
# .vox parsing, including the nTRN/nGRP/nSHP scene graph roomtaker writes
# for rooms bigger than one 256^3 tile
# ---------------------------------------------------------------------------

# magica voxel's lattice rotation ids 24..31, documented in the format spec
VOX_ROTATIONS = {
    24: np.array([[1, 0, 0], [0, 1, 0], [0, 0, 1]], dtype=int),
    25: np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]], dtype=int),
    26: np.array([[-1, 0, 0], [0, -1, 0], [0, 0, 1]], dtype=int),
    27: np.array([[0, 1, 0], [-1, 0, 0], [0, 0, 1]], dtype=int),
    28: np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=int),
    29: np.array([[0, 1, 0], [0, 0, 1], [1, 0, 0]], dtype=int),
    30: np.array([[-1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=int),
    31: np.array([[0, -1, 0], [0, 0, 1], [-1, 0, 0]], dtype=int),
}


def _read_dict(b, o):
    """magica voxel chunk attribute dict: count, then key/value string pairs"""
    (n,) = struct.unpack_from("<I", b, o)
    o += 4
    d = {}
    for _ in range(n):
        (klen,) = struct.unpack_from("<I", b, o)
        o += 4
        key = b[o:o + klen].decode("ascii")
        o += klen
        (vlen,) = struct.unpack_from("<I", b, o)
        o += 4
        d[key] = b[o:o + vlen].decode("ascii")
        o += vlen
    return d, o


def _chunks(data, off, end):
    """iterate (id, content_bytes, child_start) over a chunk list"""
    while off < end:
        cid = data[off:off + 4].decode("ascii")
        csize, ksize = struct.unpack_from("<2i", data, off + 4)
        c0 = off + 12
        yield cid, data[c0:c0 + csize], c0 + csize, ksize
        off = c0 + csize + ksize


def parse_vox(path):
    """(pos Nx3 int, color_index N, palette 256x3 uint8) in one merged frame"""
    data = open(path, "rb").read()
    if data[:4] != b"VOX ":
        raise RuntimeError("not a .vox file")
    main_size, main_children = struct.unpack_from("<2i", data, 12)
    body_start, body_end = 20, 20 + main_size + main_children
    if main_children == 0:
        body_end = len(data)

    palette = np.full((256, 3), 255, dtype=np.uint8)
    models = {}         # model_id -> Nx4 (x, y, z, color_index)
    transforms = {}    # node_id -> (child_node_id, t, rot)
    groups = {}         # node_id -> [child node ids]
    shapes = {}         # node_id -> [model ids]

    top = list(_chunks(data, body_start, body_end))
    ci = 0
    while ci < len(top):
        cid, content, kid_start, ksize = top[ci]
        kids = list(_chunks(data, kid_start, kid_start + ksize)) if ksize else []

        if cid == "SIZE":
            # a bare model: SIZE followed by its XYZI as the next sibling.
            # its id is its order among SIZE chunks, which is what nSHP
            # references.
            cid2, content2, _k2, _ks2 = top[ci + 1]
            assert cid2 == "XYZI", "SIZE must be followed by XYZI"
            n = struct.unpack_from("<i", content2, 0)[0]
            models[len(models)] = np.frombuffer(
                content2, dtype=np.uint8, count=n * 4,
                offset=4).reshape(n, 4).astype(int)
            ci += 1
        elif cid == "nTRN":
            # node_id, attrs dict, child_id, reserved, layer, num_frames,
            # then one dict per frame: _t = "x y z", _r = "24".."31"
            o = 0
            (node_id,) = struct.unpack_from("<i", content, o)
            o += 4
            _attrs, o = _read_dict(content, o)
            child_id, _reserved, _layer, nframes = struct.unpack_from(
                "<4i", content, o)
            o += 16
            t = np.zeros(3, dtype=int)
            rot = np.eye(3, dtype=int)
            if nframes >= 1:
                fd, o = _read_dict(content, o)
                if "_t" in fd:
                    t = np.array([int(v) for v in fd["_t"].split()], dtype=int)
                if "_r" in fd:
                    rid = int(fd["_r"])
                    if rid in VOX_ROTATIONS:
                        rot = VOX_ROTATIONS[rid]
            transforms[node_id] = (child_id, t, rot)
        elif cid == "nGRP":
            node_id = struct.unpack_from("<i", content, 0)[0]
            nc = struct.unpack_from("<i", content, 4)[0]
            groups[node_id] = list(struct.unpack_from(f"<{nc}i", content, 8))
        elif cid == "nSHP":
            # node_id, attrs dict, num_models, then per model: model_id +
            # attrs dict
            o = 0
            (node_id,) = struct.unpack_from("<i", content, o)
            o += 4
            _attrs, o = _read_dict(content, o)
            (nm,) = struct.unpack_from("<i", content, o)
            o += 4
            mids = []
            for _ in range(nm):
                (mid,) = struct.unpack_from("<i", content, o)
                o += 4
                _mattrs, o = _read_dict(content, o)
                mids.append(mid)
            shapes[node_id] = mids
        elif cid == "RGBA":
            arr = np.frombuffer(content, dtype=np.uint8,
                                count=len(content) - len(content) % 4
                                ).reshape(-1, 4)[:, :3].copy()
            if len(arr) == 256:
                palette[:] = arr
        ci += 1

    def collect(node_id, T, R, out):
        if node_id in transforms:
            child_id, t, rot = transforms[node_id]
            collect(child_id, rot @ T + t, rot @ R, out)
        elif node_id in groups:
            for c in groups[node_id]:
                collect(c, T, R, out)
        elif node_id in shapes:
            for m in shapes[node_id]:
                arr = models.get(m)
                if arr is None:
                    continue
                out.append(((arr[:, :3] @ R.T) + T, arr[:, 3]))

    referenced = set()
    for child_id, _t, _r in transforms.values():
        referenced.add(child_id)
    for ch in groups.values():
        referenced.update(ch)
    out = []
    for rid in transforms:
        if rid not in referenced:
            collect(rid, np.zeros(3, dtype=int), np.eye(3, dtype=int), out)
    if not out and shapes:
        for nid in shapes:
            if nid not in referenced:
                collect(nid, np.zeros(3, dtype=int), np.eye(3, dtype=int), out)
    if not out:
        raise RuntimeError("no voxels found in the scene graph")

    pos = np.vstack([o[0] for o in out]).astype(float)
    col = np.concatenate([o[1] for o in out])
    return pos, col, palette



    pos = np.vstack([o[0] for o in out]).astype(float)
    col = np.concatenate([o[1] for o in out])
    return pos, col, palette


# ---------------------------------------------------------------------------
# occupancy -> surface -> low-poly
# ---------------------------------------------------------------------------

def vox_to_grid(pos, col, ncol):
    lo = np.floor(pos.min(axis=0)).astype(int)
    hi = np.ceil(pos.max(axis=0)).astype(int) + 1
    shape = hi - lo
    occ = np.zeros(shape, dtype=np.float32)
    cgrid = np.zeros(shape + (3,), dtype=np.uint8)
    palette = np.zeros((256, 3), dtype=np.uint8)
    # color per voxel: palette lookup happens before the grid so the grid
    # stores straight rgb
    return lo, shape, pos, col


def build(pos, colors_idx, palette, target_faces=24000, ao_strength=0.45):
    from skimage import measure

    lo = np.floor(pos.min(axis=0)).astype(int)
    hi = np.ceil(pos.max(axis=0)).astype(int) + 1
    shape = tuple(hi - lo)
    occ = np.zeros(shape, dtype=np.float32)
    rgb = np.zeros(shape + (3,), dtype=np.float32)

    # vox color indices are 1-based against the RGBA chunk (index 0 is the
    # last entry, magica voxel's invalid marker)
    idx = np.where(colors_idx == 0, 255, colors_idx - 1)
    vox_rgb = palette[np.clip(idx, 0, 255)] / 255.0
    ix = pos.astype(int) - lo
    occ[ix[:, 0], ix[:, 1], ix[:, 2]] = 1.0
    rgb[ix[:, 0], ix[:, 1], ix[:, 2]] = vox_rgb

    # marching cubes: voxels become a smooth field surface, not a cube pile
    verts, faces, normals, _ = measure.marching_cubes(
        occ, level=0.5, spacing=(1.0, 1.0, 1.0))

    mesh = _decimate(verts, faces, target_faces)

    # face colours: the colour of the nearest occupied voxel. a face
    # centroid sits on the 0.5 isosurface between an occupied and an empty
    # cell, so the cell at the centroid is empty half the time
    from scipy import ndimage
    f = mesh.faces
    v = mesh.verts
    centroids = v[f].mean(axis=1)
    _, nearest = ndimage.distance_transform_edt(occ == 0, return_indices=True)
    ci = np.clip(np.rint(centroids).astype(int), 0, np.array(shape) - 1)
    ni = nearest[:, ci[:, 0], ci[:, 1], ci[:, 2]]
    face_rgb = rgb[ni[0], ni[1], ni[2]]

    # ao from the voxel grid: occupancy around a point just inside the
    # surface. creases (furniture against furniture) sit darker.
    fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    fn = fn / (np.linalg.norm(fn, axis=1, keepdims=True) + 1e-9)
    inside = centroids - fn * 0.8
    ao = np.zeros(len(f))
    for off in ((0, 0, 0), (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0),
                (0, 0, 1), (0, 0, -1), (1, 1, 0), (1, -1, 0), (-1, 1, 0),
                (-1, -1, 0), (0, 1, 1), (0, 1, -1), (0, -1, 1), (0, -1, -1),
                (1, 0, 1), (1, 0, -1), (-1, 0, 1), (-1, 0, -1)):
        p = np.clip((inside + off).astype(int), 0, np.array(shape) - 1)
        ao += occ[p[:, 0], p[:, 1], p[:, 2]]
    ao /= 19.0
    ao = np.clip(ao, 0, 1) * ao_strength
    face_rgb *= (1.0 - ao)[:, None]

    # recenter: room centre at origin, floor at y=0
    v = v - lo.astype(float)
    center = (v.min(axis=0) + v.max(axis=0)) / 2
    v = v - center
    v[:, 1] -= v[:, 1].min()
    return v, f, np.clip(face_rgb * 255, 0, 255), center


def _decimate(verts, faces, target):
    import trimesh
    m = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    try:
        m = m.simplify_quadric_decimation(face_count=target)
    except Exception:
        # vertex clustering keeps the low-poly look without extra deps
        grid = np.rint(verts / 2.0).astype(int)
        uniq, inv = np.unique(grid, axis=0, return_inverse=True)
        # cluster centroids per cell, then rebuild faces (degenerate ones drop)
        new_v = np.zeros((len(uniq), 3))
        for i in range(len(uniq)):
            sel = inv == i
            new_v[i] = verts[sel].mean(axis=0)
        new_f = inv[faces]
        keep = ((new_f[:, 0] != new_f[:, 1]) & (new_f[:, 0] != new_f[:, 2])
                & (new_f[:, 1] != new_f[:, 2]))
        return SimpleMesh(new_v, new_f[keep])
    return SimpleMesh(np.asarray(m.vertices), np.asarray(m.faces))


class SimpleMesh:
    def __init__(self, verts, faces):
        self.verts = verts
        self.faces = faces


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vox", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--faces", type=int, default=24000)
    ap.add_argument("--preview", default=None)
    args = ap.parse_args()

    pos, colors_idx, palette = parse_vox(args.vox)
    print(f"vox: {len(pos)} voxels, {len(np.unique(colors_idx))} colours")
    v, f, fc, center = build(pos, colors_idx, palette, target_faces=args.faces)
    print(f"lowpoly: {len(f)} faces, {len(v)} verts (room centre {center})")

    np.savez(args.out, verts=v, faces=f, face_colors=fc,
             bbox=np.stack([v.min(axis=0), v.max(axis=0)]))
    print("wrote", args.out)
    if args.preview:
        _preview(v, f, fc, args.preview)
        print("preview:", args.preview)


def _preview(v, f, fc, out):
    """render the bridge result alone, orthographic-ish, so it can be judged"""
    from PIL import Image
    W, H = 1280, 720
    center = (v.min(axis=0) + v.max(axis=0)) / 2
    span = v.max(axis=0) - v.min(axis=0)
    v = v - center
    v = v / max(span) * 400.0
    # a proskena-style three-quarter view
    a = math.radians(28)
    b = math.radians(22)
    dirv = np.array([math.cos(a) * math.cos(b), math.sin(b),
                     math.sin(a) * math.cos(b)])
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(dirv, up)
    right /= np.linalg.norm(right)
    upv = np.cross(right, dirv)
    proj = v @ np.stack([right, upv, dirv]).T
    sx = W / 2 + proj[:, 0] / max(abs(proj[:, 0]).max(), 1) * (W / 2 - 40)
    sy = H / 2 - proj[:, 1] / max(abs(proj[:, 1]).max(), 1) * (H / 2 - 40)
    tri = np.stack([sx, sy], axis=1)[f]
    z = proj[:, 2][f].mean(axis=1)
    order = np.argsort(z)[::-1]
    img = np.full((H, W, 3), (14, 15, 18), dtype=np.uint8)
    for t in order:
        p0, p1, p2 = tri[t]
        x0 = int(max(np.floor(min(p0[0], p1[0], p2[0])), 0))
        x1 = int(min(np.ceil(max(p0[0], p1[0], p2[0])), W))
        y0 = int(max(np.floor(min(p0[1], p1[1], p2[1])), 0))
        y1 = int(min(np.ceil(max(p0[1], p1[1], p2[1])), H))
        if x0 >= x1 or y0 >= y1:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1), np.arange(y0, y1))
        e01 = (p1[0] - p0[0]) * (ys - p0[1]) - (p1[1] - p0[1]) * (xs - p0[0])
        e12 = (p2[0] - p1[0]) * (ys - p1[1]) - (p2[1] - p1[1]) * (xs - p1[0])
        e20 = (p0[0] - p2[0]) * (ys - p2[1]) - (p0[1] - p2[1]) * (xs - p2[0])
        mask = ((e01 >= 0) & (e12 >= 0) & (e20 >= 0)) | \
               ((e01 <= 0) & (e12 <= 0) & (e20 <= 0))
        img[y0:y1, x0:x1][mask] = fc[t]
    Image.fromarray(img).save(out)


if __name__ == "__main__":
    main()
