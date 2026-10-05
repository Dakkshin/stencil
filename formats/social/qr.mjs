/**
 * Registration QR selection for social posts (from iu-panel-social-posts/lib/qr.mjs).
 *
 * Supplied images only, never generated. The variant comes from the post's promo stage
 * (speaker 1, intro 2, panel 3, countdown 4, live day 5); the brand never changes it, so
 * both layouts share this rule. An explicit `event.qr` (even an empty one) always wins.
 *
 * Changes from the fork: the fork looked in its own `qrs/` folder. Here the folders are the
 * QR pools (the workspace's assets/qrs, then the repo's), and a relative explicit path is
 * tried in each pool and then against the pool's parent and the workspace and repo roots.
 * Passing `root` keeps the fork's one-folder behaviour (`<root>/qrs`), which its tests use.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, WORKSPACE, poolDirs } from "../../core/paths.mjs";

const folderKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isFile = (file) => {
  try { return fs.statSync(file).isFile(); } catch { return false; }
};

export function qrVariant(postType) {
  if (postType === "speaker_promo") return 1;
  if (postType === "the_intro") return 2;
  if (postType === "panel") return 3;
  if (postType === "one_more_day") return 4;
  if (postType === "happening_today") return 5;
  return null;
}

/** QR folders to search, in order: `<root>/qrs` when given, else the QR pools. */
export function qrPools(root) {
  return root ? [path.join(root, "qrs")] : poolDirs("qrs");
}

/** Select supplied images only. An explicit qr (even empty) always wins. */
export function resolvePostQr({ root, event = {}, person, profile, panelists = [], postType, name, warnings = [] }) {
  const warn = (message) => warnings.push(`  [${name}] ${message} (hidden)`);
  const pools = qrPools(root);
  if (Object.hasOwn(event, "qr")) {
    if (!event.qr) return "";
    const qr = String(event.qr);
    if (qr.startsWith("data:")) return qr;
    const bases = root ? [root] : [...new Set([...pools.map((d) => path.dirname(d)), WORKSPACE, ROOT])];
    const candidates = path.isAbsolute(qr) ? [qr] : [...pools.map((d) => path.resolve(d, qr)), ...bases.map((b) => path.resolve(b, qr))];
    const found = candidates.find(isFile);
    if (found) return found;
    warn(`qr image not found: ${qr}`);
    return "";
  }

  const variant = qrVariant(postType);
  const identity = person || (panelists.length === 1 ? profile || panelists[0].name : "");
  if (!variant || !folderKey(identity)) return "";
  /* The first pool holding a folder for this person decides, so a workspace can override
     the repo's QR set for one person without copying the rest. */
  for (const dir of pools) {
    if (!fs.existsSync(dir)) continue;
    const folders = fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && folderKey(entry.name) === folderKey(identity));
    if (!folders.length) continue; // QR support is optional until a person has a folder.
    if (folders.length > 1) {
      warn(`multiple QR folders match "${identity}"; set event.qr explicitly`);
      return "";
    }
    const folder = path.join(dir, folders[0].name);
    const files = fs.readdirSync(folder).filter((file) => {
      // Accept 1.png / 01.jpg and downloaded names ending in the variant,
      // such as QR_https___example.com_PanelBB1.png. Never match 11.png.
      const m = /(?:^|[^0-9])(0?[1-5])\.(png|jpe?g)$/i.exec(file);
      return m && Number(m[1]) === variant && isFile(path.join(folder, file));
    });
    if (files.length === 1) return path.join(folder, files[0]);
    warn(files.length ? `multiple QR images for ${identity} variant ${variant}; set event.qr explicitly`
      : `qr image not found: qrs/${folders[0].name}/${variant}.png (PNG/JPG/JPEG accepted)`);
    return "";
  }
  return "";
}

/** A resolved QR file as the post would name it: relative to the pool that holds it. */
export function qrRef(file, root) {
  if (!file || file.startsWith("data:")) return file || "";
  for (const dir of qrPools(root)) {
    const rel = path.relative(dir, file);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel;
  }
  return file;
}
