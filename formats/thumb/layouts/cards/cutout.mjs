/**
 * Background removal for cut-out speakers.
 *
 * A plain JPG portrait becomes a transparent PNG that the thumbnail can place
 * as a cut-out. Background removal is expensive (Python + rembg), so results
 * are cached on the source file; re-runs are instant.
 *
 *   source : headshots/anything.jpg
 *   output : headshots/cutouts/anything-cutout.png   (+ .json sidecar)
 *
 * The framing/placement lives in the renderers — this only produces the
 * transparent silhouette. Reused from panel-social-posts/lib/cutout.py.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { ROOT as STENCIL_ROOT } from "../../../../core/paths.mjs";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = STENCIL_ROOT;
const VENV = path.join(ROOT, ".venv");
const VENV_PY = path.join(VENV, "bin", "python");
const HELPER = path.join(__dirname, "cutout.py");
export const CUTOUT_DIR = path.join(ROOT, "assets", "headshots", "cutouts");

const PY_DEPS = [
  "rembg==2.0.81",
  "onnxruntime==1.29.0",
  "opencv-python-headless<5",
  "pillow",
];

function run(cmd, args, opts = {}) {
  return execFileAsync(cmd, args, { maxBuffer: 32 * 1024 * 1024, ...opts });
}

/* True for a PNG with an alpha channel (colour types 4/6). */
export function hasAlpha(file) {
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(26);
    fs.readSync(fd, buf, 0, 26, 0);
    fs.closeSync(fd);
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return png && (buf[25] === 4 || buf[25] === 6);
  } catch {
    return false;
  }
}

export function cutoutPathFor(photoPath) {
  const stem = path.basename(photoPath).replace(/\.[^.]+$/, "");
  return path.join(CUTOUT_DIR, `${stem}-cutout.png`);
}

/* The generated cut-out sibling for a photo, if it exists. */
export function cutoutSibling(photoPath) {
  const p = cutoutPathFor(photoPath);
  return fs.existsSync(p) ? p : "";
}

/* The sidecar written alongside a generated cut-out, holding the silhouette
   bbox, the face box and the width profile. The renderers use `face` to frame
   every cut-out to a common head size and eye line. Returns null when there is
   no sidecar (e.g. a hand-made transparent PNG). */
export function cutoutSidecar(photoPath) {
  if (!photoPath) return null;
  /* The sidecar sits next to the cut-out PNG. The photo may already BE the
     cut-out (referenced directly) or a JPG whose cut-out sibling is used. */
  const own = path.join(
    path.dirname(photoPath),
    path.basename(photoPath).replace(/\.[^.]+$/, ".json"),
  );
  const sibling = cutoutPathFor(photoPath).replace(/\.png$/, ".json");
  for (const sidecar of own === sibling ? [own] : [own, sibling]) {
    if (!fs.existsSync(sidecar)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(sidecar, "utf8"));
      if (meta && meta.ok) return meta;
    } catch {
      /* fall through to the next candidate */
    }
  }
  return null;
}

async function havePython(py) {
  try {
    await run(py, ["-c", "import rembg, cv2, PIL"]);
    return true;
  } catch {
    return false;
  }
}

/* Resolve an interpreter that can import rembg. Honours IU_CUTOUT_PYTHON so a
   sibling tool's venv can be reused; otherwise creates the tool's own .venv. */
async function ensurePython() {
  if (process.env.IU_CUTOUT_PYTHON) {
    return (await havePython(process.env.IU_CUTOUT_PYTHON)) ? process.env.IU_CUTOUT_PYTHON : null;
  }
  if (await havePython(VENV_PY)) return VENV_PY;
  console.log("  (cutout: setting up .venv for background removal — one time, a few minutes)");
  try {
    try {
      await run("uv", ["venv", "--python", "3.14", VENV], { cwd: ROOT });
      await run("uv", ["pip", "install", "--python", VENV_PY, ...PY_DEPS], { cwd: ROOT });
    } catch {
      await run("python3", ["-m", "venv", VENV], { cwd: ROOT });
      await run(path.join(VENV, "bin", "pip"), ["install", "-q", ...PY_DEPS], { cwd: ROOT });
    }
    return (await havePython(VENV_PY)) ? VENV_PY : null;
  } catch (e) {
    console.warn(`  (cutout: could not set up Python for background removal: ${e.message})`);
    return null;
  }
}

/**
 * Ensure a transparent cut-out exists for `photoPath`.
 * Returns the cut-out path, or null when background removal is unavailable.
 */
export async function ensureCutout(photoPath, { model = "u2net", force = false } = {}) {
  const dest = cutoutPathFor(photoPath);
  const sidecar = dest.replace(/\.png$/, ".json");
  const st = fs.statSync(photoPath);
  const key = `${st.size}:${Math.round(st.mtimeMs)}:${model}:v1`;

  if (!force && fs.existsSync(dest) && fs.existsSync(sidecar)) {
    try {
      if (JSON.parse(fs.readFileSync(sidecar, "utf8")).key === key) return dest;
    } catch {
      /* regenerate */
    }
  }

  const py = await ensurePython();
  if (!py) return null;

  fs.mkdirSync(CUTOUT_DIR, { recursive: true });
  console.log(`  · removing background: ${path.basename(photoPath)} (${model})…`);
  const { stdout } = await run(py, [HELPER, photoPath, dest, "--model", model]);
  const meta = JSON.parse(stdout.trim().split("\n").pop());
  if (!meta.ok) throw new Error(meta.error || "background removal failed");
  meta.key = key;
  fs.writeFileSync(sidecar, JSON.stringify(meta, null, 2));
  return dest;
}

export default { ensureCutout, cutoutSibling, cutoutSidecar, cutoutPathFor, hasAlpha, CUTOUT_DIR };
