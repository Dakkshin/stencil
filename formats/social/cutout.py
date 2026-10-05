"""Background removal for speaker_promo portraits.

Called by lib/cutout.mjs. Deliberately knows nothing about card geometry: it
detects the face, crops a generous region around the person (u2net downsamples
its input to 320x320, so feeding it a whole room photo starves the hair matte),
removes the background, and reports where the face landed. All framing math
lives on the Node side in lib/cutout.mjs + lib/portrait-fit.mjs.

Usage: cutout.py <source-image> <dest-png> [--model u2net]
Emits one line of JSON on stdout describing the result.
"""

import argparse
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from rembg import new_session, remove

# u2net sees a 320x320 downsample of whatever we hand it; past ~2000px the
# extra detail is thrown away anyway and only costs time.
MAX_INPUT_EDGE = 2000

# Rows sampled for the silhouette width profile. 240 is well past what the
# framing search needs and costs nothing to carry in the sidecar JSON.
PROFILE_ROWS = 240


def detect_face(img):
    """Largest frontal face in a PIL RGB image, in source pixels, or None."""
    cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    if cascade.empty():
        return None
    w, h = img.size
    scale = 1200 / max(w, h) if max(w, h) > 1200 else 1.0
    small = img.resize((max(1, int(w * scale)), max(1, int(h * scale))))
    gray = cv2.equalizeHist(cv2.cvtColor(np.array(small), cv2.COLOR_RGB2GRAY))
    faces = cascade.detectMultiScale(gray, 1.08, 6, minSize=(40, 40))
    if len(faces) == 0:
        return None
    x, y, fw, fh = max(faces, key=lambda r: r[2] * r[3])
    return {
        "x": x / scale,
        "y": y / scale,
        "w": fw / scale,
        "h": fh / scale,
    }


def person_region(face, w, h):
    """Generous box around the person: hair above, torso below, arms either side."""
    cx = face["x"] + face["w"] / 2
    fh = face["h"]
    return (
        max(0, int(cx - 2.6 * fh)),
        max(0, int(face["y"] - 1.1 * fh)),
        min(w, int(cx + 2.6 * fh)),
        min(h, int(face["y"] + 7.0 * fh)),
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("dest")
    ap.add_argument("--model", default="u2net")
    args = ap.parse_args()

    img = Image.open(args.source).convert("RGB")
    src_w, src_h = img.size

    face = detect_face(img)
    if face:
        box = person_region(face, src_w, src_h)
        img = img.crop(box)
    else:
        box = (0, 0, src_w, src_h)

    # Track how source pixels map into the image we actually hand to rembg, so
    # the reported face box is in dest-PNG coordinates.
    scale = 1.0
    if max(img.size) > MAX_INPUT_EDGE:
        scale = MAX_INPUT_EDGE / max(img.size)
        img = img.resize(
            (max(1, int(img.size[0] * scale)), max(1, int(img.size[1] * scale))),
            Image.LANCZOS,
        )

    cut = remove(img, session=new_session(args.model))
    os.makedirs(os.path.dirname(os.path.abspath(args.dest)), exist_ok=True)
    cut.save(args.dest)

    alpha = np.array(cut)[:, :, 3] > 128
    ys, xs = np.where(alpha)
    if len(ys) == 0:
        print(json.dumps({"ok": False, "error": "background removal left no opaque pixels"}))
        return 1

    # Per-row silhouette extent, sampled evenly down the image. The framing math
    # needs this to tell how wide the person is *in the part of the photo the
    # card actually shows* — shoulders that end up below the card's bottom edge
    # must not constrain how large the portrait can be drawn.
    rows = np.where(alpha.any(axis=1))[0]
    samples = []
    for i in range(PROFILE_ROWS):
        y = int(round(rows[0] + (rows[-1] - rows[0]) * i / (PROFILE_ROWS - 1)))
        cols = np.where(alpha[y])[0]
        samples.append([y, int(cols[0]), int(cols[-1])] if len(cols) else [y, 0, -1])

    result = {
        "ok": True,
        "model": args.model,
        "size": [cut.size[0], cut.size[1]],
        "bbox": {
            "left": int(xs.min()),
            "top": int(ys.min()),
            "right": int(xs.max()),
            "bottom": int(ys.max()),
        },
        "face": None,
        "profile": samples,
    }
    if face:
        result["face"] = {
            "x": round((face["x"] - box[0]) * scale, 1),
            "y": round((face["y"] - box[1]) * scale, 1),
            "w": round(face["w"] * scale, 1),
            "h": round(face["h"] * scale, 1),
        }
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
