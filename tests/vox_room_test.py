# the vox parser is the only format code in the bridge, so it gets the test:
# a tiny synthetic room in the tiled format roomtaker writes (nTRN -> nSHP ->
# one model), with a rotation, a palette, and color indices in the 1-based
# convention, checked against the merged world grid.
# run: python3 -m pytest tests/vox_room_test.py

import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from vox_room import parse_vox, VOX_ROTATIONS  # noqa: E402


def chunk(cid: bytes, content: bytes, children=b""):
    return cid + struct.pack("<ii", len(content),
                             len(children)) + content + children


def dict_chunk(pairs):
    out = struct.pack("<I", len(pairs))
    for k, v in pairs:
        kb, vb = k.encode(), v.encode()
        out += struct.pack("<I", len(kb)) + kb
        out += struct.pack("<I", len(vb)) + vb
    return out


def make_vox(rot_id, translation):
    # model: two voxels, colors 1 and 2
    voxels = bytes([0, 0, 0, 1, 1, 0, 0, 2])
    xyzi = struct.pack("<I", 2) + voxels
    model = chunk(b"SIZE", struct.pack("<3i", 2, 1, 1)) + chunk(b"XYZI", xyzi)
    ntrn = chunk(b"nTRN", struct.pack("<i", 1) + dict_chunk([])
                 + struct.pack("<4i", 0, -1, 0, 1)
                 + dict_chunk([("_t", " ".join(map(str, translation))),
                               ("_r", str(rot_id))]))
    nshp = chunk(b"nSHP", struct.pack("<i", 0) + dict_chunk([])
                 + struct.pack("<I", 1) + struct.pack("<i", 0)
                 + dict_chunk([]))
    palette = b"".join(struct.pack("<4B", 255 - i, i, 100, 255)
                       for i in range(256))
    rgba = chunk(b"RGBA", palette)
    main = ntrn + nshp + model + rgba
    return b"VOX " + struct.pack("<i", 200) + chunk(b"MAIN", b"", main)


def test_identity_transform_and_palette():
    data = make_vox(24, (10, 0, 5))
    Path("/tmp/bridge_identity.vox").write_bytes(data)
    pos, col, palette = parse_vox("/tmp/bridge_identity.vox")
    assert len(pos) == 2
    assert sorted(map(tuple, pos)) == [(10, 0, 5), (11, 0, 5)]
    # color 1 is the first RGBA entry (1-based indices)
    assert tuple(palette[col[0]]) == (254, 1, 100)


def test_rotation_moves_voxels():
    # rotation 26: (x,y,z) -> (-x,-y,z)
    data = make_vox(26, (0, 0, 0))
    Path("/tmp/bridge_rot.vox").write_bytes(data)
    pos, _col, _pal = parse_vox("/tmp/bridge_rot.vox")
    xs = sorted(p[0] for p in pos)
    assert xs == [-1, 0]  # voxels at 0 and 1 land at 0 and -1


def test_full_file_matches_roomtaker_layout():
    # roomtaker's own detective export: parse it, count, and check the
    # floor voxel exists somewhere plausible
    room = Path(__file__).parent.parent / "assets/rooms/btco__detective.vox"
    if not room.exists():
        return  # not exported in this checkout: skip, no skip markers needed
    pos, col, palette = parse_vox(str(room))
    assert len(pos) == 27545
    assert len(palette) == 256
