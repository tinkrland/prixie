#!/usr/bin/env python3
"""the matte stage: remove the background of the person video. this is stage
one of the composite pipeline, not an external input: the turn generates the
matte from the masky clip (rembg, u2net), the composite consumes it.

the person video is the FOREGROUND. its own rendered background is not part
of prixie: the plate owns the background entirely, so the person arrives
transparent and the matte is what makes her so.

usage:
  python3 scripts/matte.py --in person.mp4 --out matte.mp4 [--start 0] [--duration all]

the matte is the alpha rembg produces, as a gray clip the same size and rate
as the input, so it can ride the person's framing chain exactly.
"""

import argparse
import subprocess
import sys

import numpy as np
from PIL import Image
from rembg import remove, new_session

_session = None


def get_session(model):
    global _session
    if _session is None:
        # u2net_human_seg: this is a person pipeline, and the general model
        # leaves a soft halo where her rendered backdrop bleeds through
        _session = new_session(model)
    return _session


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--duration", type=float, default=None)
    ap.add_argument("--model", default="u2net_human_seg",
                    help="rembg session model (person default: u2net_human_seg)")
    args = ap.parse_args()

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,nb_frames",
         "-of", "csv=p=0", args.inp],
        capture_output=True, text=True, check=True).stdout.strip().split(",")
    width, height, rate = int(probe[0]), int(probe[1]), probe[2]
    fps = float(rate.split("/")[0]) / float(rate.split("/")[1])

    decode = ["ffmpeg", "-v", "error", "-i", args.inp, "-f", "rawvideo",
              "-pix_fmt", "rgb24"]
    if args.start:
        decode += ["-ss", str(args.start)]
    if args.duration is not None:
        decode += ["-t", str(args.duration)]
    decode += ["-"]
    enc = ["ffmpeg", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray",
           "-s", f"{width}x{height}", "-r", str(fps), "-i", "-",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", args.out]

    dec = subprocess.Popen(decode, stdout=subprocess.PIPE)
    enc_p = subprocess.Popen(enc, stdin=subprocess.PIPE)
    frame = np.empty((height, width, 3), dtype=np.uint8)
    n = 0
    while True:
        raw = dec.stdout.read(height * width * 3)
        if not raw or len(raw) < height * width * 3:
            break
        frame[:] = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
        out = remove(Image.fromarray(frame), session=get_session(args.model),
                     post_process_mask=True)
        alpha = np.asarray(out)[:, :, 3]
        enc_p.stdin.write(alpha.tobytes())
        n += 1
    dec.stdout.close()
    dec.wait()
    enc_p.stdin.close()
    enc_p.wait()
    if enc_p.returncode != 0:
        sys.exit("the matte encoder failed")
    print(f"matte: {n} frames at {width}x{height}, {fps} fps -> {args.out}")


if __name__ == "__main__":
    main()
