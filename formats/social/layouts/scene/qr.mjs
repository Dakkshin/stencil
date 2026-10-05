import sharp from "sharp";
import { C, SPACE, RADIUS, FONT, LH, QR } from "./tokens.mjs";
import { withSize, measure } from "./text.mjs";

/** Embed a supplied image, preserving its colour and aspect ratio. No QR generation. */
export async function prepareQr(source, name) {
  if (!source) return null;
  try {
    let input = source;
    if (source.startsWith("data:")) {
      const match = /^data:image\/[^;,]+(;base64)?,([\s\S]+)$/.exec(source);
      if (!match) throw new Error("invalid image data URL");
      input = match[1] ? Buffer.from(match[2], "base64") : Buffer.from(decodeURIComponent(match[2]));
    }
    const { data, info } = await sharp(input).rotate().png().toBuffer({ resolveWithObject: true });
    return { href: `data:image/png;base64,${data.toString("base64")}`, w: info.width, h: info.height };
  } catch (error) {
    console.warn(`  [${name}] qr image could not be read: ${error.message} (hidden)`);
    return null;
  }
}

export function qrFrame(s, theme, { qr, x = 0, y = 0, edge = QR.edge, labels = "side", dryRun = false }) {
  if (!qr) return { w: 0, h: 0 };
  const k = edge / QR.edge;
  const inset = SPACE.s;
  const available = edge - inset * 2;
  const scale = available / Math.max(qr.w, qr.h);
  const w = qr.w * scale, h = qr.h * scale;
  /* Side-label dock: SCAN TO / REGISTER stack left of the frame, vertically
     centred in the frame height. The block stays `edge` tall so the footer
     never grows — the frame keeps its size and position, and the face /
     seal budget is untouched. Frame stays rightmost so right-docked cards keep
     their edge flush. Labels scale with a custom edge so an enlarged code
     keeps its instruction legible. */
  const scanFs = Math.round(QR.scanFs * k);
  const regFs = Math.round(QR.regFs * k);
  const scanFont = withSize(FONT.label, scanFs);
  const regFont = withSize(FONT.label, regFs);
  const scanLh = Math.round(scanFs * LH.label);
  const regLh = Math.round(regFs * LH.label);
  const labelW = Math.max(measure("SCAN TO", scanFont), measure("REGISTER", regFont));
  const labelGap = Math.round(QR.labelInnerGap * k);
  const labelH = scanLh + labelGap + regLh;
  const gap = SPACE.s;
  if (labels === "none") {
    /* bare code, no instruction: for corner rails where the caption would
       push content down or collide with the urgency lockup */
    if (!dryRun) s.group("Registration QR", () => {
      s.rect({ x, y, w: edge, h: edge, rx: RADIUS.soft, fill: theme.glass, stroke: theme.glassLine, name: "QR frame" });
      // Keep the supplied quiet zone and add white backing, never clip QR corners.
      s.rect({ x: x + SPACE.xs, y: y + SPACE.xs, w: edge - SPACE.s, h: edge - SPACE.s, fill: C.WHITE, name: "QR backing" });
      s.image({ href: qr.href, x: x + (edge - w) / 2, y: y + (edge - h) / 2, w, h, name: "QR image" });
    });
    return { x, y, w: edge, h: edge };
  }
  if (labels === "below") {
    /* instruction stacked under the frame, centred: a narrow block that leaves
       the footer's middle free for the accreditation seal to dock beside it. */
    const blockW = Math.max(edge, Math.round(labelW));
    const blockH = edge + SPACE.xs + labelH;
    if (!dryRun) s.group("Registration QR", () => {
      const fx = x + (blockW - edge) / 2;
      s.rect({ x: fx, y, w: edge, h: edge, rx: RADIUS.soft, fill: theme.glass, stroke: theme.glassLine, name: "QR frame" });
      // Keep the supplied quiet zone and add white backing, never clip QR corners.
      s.rect({ x: fx + SPACE.xs, y: y + SPACE.xs, w: edge - SPACE.s, h: edge - SPACE.s, fill: C.WHITE, name: "QR backing" });
      s.image({ href: qr.href, x: fx + (edge - w) / 2, y: y + (edge - h) / 2, w, h, name: "QR image" });
      const cx = x + blockW / 2;
      const top0 = y + edge + SPACE.xs;
      s.text({ x: cx, top: top0, lines: ["SCAN TO"], font: scanFont, lh: scanLh, fill: theme.fgMuted, anchor: "middle", name: "Scan to" });
      s.text({ x: cx, top: top0 + scanLh + labelGap, lines: ["REGISTER"], font: regFont, lh: regLh, fill: theme.fg, anchor: "middle", name: "Register" });
    });
    return { x, y, w: blockW, h: blockH };
  }
  const blockW = Math.round(labelW + gap + edge);
  const fx = x + blockW - edge;
  if (!dryRun) s.group("Registration QR", () => {
    s.rect({ x: fx, y, w: edge, h: edge, rx: RADIUS.soft, fill: theme.glass, stroke: theme.glassLine, name: "QR frame" });
    // Keep the supplied quiet zone and add white backing, never clip QR corners.
    s.rect({ x: fx + SPACE.xs, y: y + SPACE.xs, w: edge - SPACE.s, h: edge - SPACE.s, fill: C.WHITE, name: "QR backing" });
    s.image({ href: qr.href, x: fx + (edge - w) / 2, y: y + (edge - h) / 2, w, h, name: "QR image" });
    const lx = fx - gap;
    const top0 = y + (edge - labelH) / 2;
    s.text({ x: lx, top: top0, lines: ["SCAN TO"], font: scanFont, lh: scanLh, fill: theme.fgMuted, anchor: "end", name: "Scan to" });
    s.text({ x: lx, top: top0 + scanLh + labelGap, lines: ["REGISTER"], font: regFont, lh: regLh, fill: theme.fg, anchor: "end", name: "Register" });
  });
  return { x, y, w: blockW, h: edge };
}
