# the glb prop loader: scanned props with vertex colors are a different
# class from the parametric PROP_LIBRARY boxes. colors live on vertices,
# decimation must not lose them, and meters must become proskena's mm.
# run: python3 -m pytest tests/glb_prop_test.py

import sys
from pathlib import Path

import numpy as np
import trimesh

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from render_plate import load_glb_prop  # noqa: E402


def make_glb(path, n_grid=30):
    # a colored cube grid: vertex color encodes position, so color loss
    # in a decimation shows up as the bounds drifting
    box = trimesh.creation.box(extents=[1.0, 0.5, 0.674])
    verts = box.vertices
    # refine so decimation has something to remove
    m = box.copy()
    m = m.subdivide()
    cols = np.clip((m.vertices - m.vertices.min(axis=0)) /
                   np.ptp(m.vertices, axis=0) * 255, 0, 255).astype(np.uint8)
    m.visual.vertex_colors = np.concatenate(
        [cols, np.full((len(cols), 1), 255, dtype=np.uint8)], axis=1)
    trimesh.Scene(m).export(path)
    return m


def test_vertex_colors_become_lit_face_colors(tmp_path):
    p = tmp_path / "prop.glb"
    make_glb(p)
    parts = load_glb_prop(str(p))
    assert len(parts) == 1
    v, f, mode, fc = parts[0]
    assert mode == "lit"
    # meters -> proskena mm, and the prop sits on the floor: its base is
    # y=0 and its height is the bbox height in mm
    assert v[:, 1].min() == 0
    assert abs(v[:, 1].max() - 500) < 2  # the box is 0.5 m tall
    assert len(fc) == len(f)
    # face colors carry the vertex palette, not a flat fallback
    assert fc.min() < 80 and fc.max() > 180


def test_decimation_keeps_the_paint(tmp_path):
    p = tmp_path / "prop.glb"
    m = make_glb(p)
    parts = load_glb_prop(str(p), face_cap=max(12, len(m.faces) // 4))
    v, f, _mode, fc = parts[0]
    assert len(f) <= max(12, len(m.faces) // 4) + 20
    # the palette survives the decimation: bounds of the color distribution
    # stay close to the original vertex colors'
    raw = np.asarray(m.visual.vertex_colors)[:, :3].astype(float)
    assert abs(fc.mean() - raw.mean()) < 30
    assert fc.std() > raw.std() * 0.5
