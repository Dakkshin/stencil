#!/usr/bin/env node
/**
 * Generate layered, Canva-friendly SVG thumbnails from the same JSON configs
 * used by the HTML template.
 *
 * This is the SVG twin of iu-thumbnail-template.html. Both run `compose()` from
 * lib/layout.mjs on the same config, so every box (lead, title lines, cards,
 * pictures, labels, petal) is computed once and painted twice. It honours
 * Canva editability rules:
 *   - plain <text> elements (best chance of staying editable text in Canva);
 *   - one element = one editable layer, with readable ids/data-names;
 *   - the backdrop (Depth / Air gradient + Quiet lobes) is baked in as a few
 *     flat layers, because Canva flattens CSS gradients;
 *   - Inter Display, Inter and EB Garamond are embedded as base64 woff2 so the
 *     SVG renders with the brand's real type, not a system fallback.
 *
 * Usage:
 *   node render-svg.mjs                      # all examples/*.json → canva/
 *   node render-svg.mjs -c examples/dark-solo.json
 *   node render-svg.mjs --preview            # also rasterize a PNG via sharp (if installed)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { CANVAS, PAD, LOGO, LOGO_H, CHIP, KICKER, G } from "./geometry.mjs";
import { compose, textWidth, baseline } from "./layout.mjs";
import { atmosphereFragment, petalTriad, substitutePaint, THEME_PAINT } from "./motif.mjs";
import { CANVA, FONTS, LOGOS, WORKSPACE } from "../../../../core/paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.join(__dirname, "examples");
const OUT_DIR = CANVA;
const FONT_DIR = FONTS;
const LOGO_PATH = path.join(LOGOS, "iu-logo.png");
const LOGO_REVERSED = path.join(LOGOS, "iu-logo-reversed.svg");
const REVERSED_VIEW_W = 1848; // viewBox width of the traced reversed lockup

const W = CANVAS.w;
const H = CANVAS.h;

const DISPLAY = "InterDisplay";
const SANS = "Inter";
const SERIF = "EBGaramond";

const FONT_FACES = [
  { family: DISPLAY, style: "normal", weight: "400", file: "InterDisplay-400.woff2" },
  { family: DISPLAY, style: "normal", weight: "500", file: "InterDisplay-500.woff2" },
  { family: DISPLAY, style: "normal", weight: "600", file: "InterDisplay-600.woff2" },
  { family: SANS, style: "normal", weight: "400", file: "Inter-400.woff2" },
  { family: SANS, style: "normal", weight: "500", file: "Inter-500.woff2" },
  { family: SANS, style: "normal", weight: "600", file: "Inter-600.woff2" },
  { family: SERIF, style: "normal", weight: "500", file: "EBGaramond-500.woff2" },
  { family: SERIF, style: "italic", weight: "500", file: "EBGaramond-500-italic.woff2" },
];

const n1 = (v) => Number(v).toFixed(1);
const n2 = (v) => Number(v).toFixed(2);

const escXml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
  }[c]));

/* ------------------------------------------------------------
   Theme (mirrors .canvas.theme-dark / .theme-light)
   ------------------------------------------------------------ */
function theme(mode) {
  if (mode === "light") {
    return {
      fg: "#12182B",
      kicker: "#4D7BAC",
      chipBg: "rgba(255,255,255,0.85)",
      chipLine: "#D8E0EB",
      chipFg: "#2A3A71",
      /* --card-shadow: 0 20px 40px rgba(42,58,113,.3); CSS blur B = SVG σ B/2 */
      shadow: { dy: 20, sd: 20, color: "#2A3A71", opacity: 0.3 },
    };
  }
  return {
    fg: "#FFFFFF",
    kicker: "#8BB3E2",
    chipBg: "rgba(244,247,251,0.10)",
    chipLine: "rgba(255,255,255,0.20)",
    chipFg: "#E7EEF9",
    /* --card-shadow: 0 24px 48px rgba(4,8,20,.5) */
    shadow: { dy: 24, sd: 24, color: "#040814", opacity: 0.5 },
  };
}

/* ------------------------------------------------------------
   SVG builders
   ------------------------------------------------------------ */
function fontFaceCss() {
  const faces = FONT_FACES.map((f) => {
    const p = path.join(FONT_DIR, f.file);
    if (!fs.existsSync(p)) {
      console.warn(`    (font not found, will fall back: ${f.file})`);
      return "";
    }
    const b64 = fs.readFileSync(p).toString("base64");
    return `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};font-display:block;src:url("data:font/woff2;base64,${b64}") format("woff2");}`;
  }).filter(Boolean);
  return `<style>${faces.join("")}
text{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}</style>`;
}

function defs(mode, L, t) {
  const ground =
    mode === "light"
      ? `<linearGradient id="ground" gradientUnits="userSpaceOnUse" x1="425.1" y1="-171.8" x2="854.9" y2="891.8">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.46" stop-color="#F4F7FB"/>
      <stop offset="1" stop-color="#C8DDF5"/>
    </linearGradient>`
      : `<radialGradient id="ground" gradientUnits="userSpaceOnUse" cx="1100.8" cy="57.6" r="1600">
      <stop offset="0" stop-color="#1B2560"/>
      <stop offset="0.55" stop-color="#12182B"/>
      <stop offset="1" stop-color="#0A0F22"/>
    </radialGradient>`;

  const lobeColors =
    mode === "light"
      ? [["#8BB3E2", "0.42"], ["#6289D9", "0.20"]]
      : [["#6289D9", "0.34"], ["#7277D2", "0.26"]];

  /* One rounded clip per card, shared by its picture. */
  const clips = L.people
    .map((p, i) => {
      const c = p.card;
      return `    <clipPath id="guest-${String(i + 1).padStart(2, "0")}-clip"><rect x="${n2(c.x)}" y="${n2(c.y)}" width="${n2(c.w)}" height="${n2(c.h)}" rx="${L.radius}"/></clipPath>`;
    })
    .join("\n");

  return `
  <defs>
    ${ground}
    <radialGradient id="lobe-a"><stop offset="0" stop-color="${lobeColors[0][0]}" stop-opacity="${lobeColors[0][1]}"/><stop offset="1" stop-color="${lobeColors[0][0]}" stop-opacity="0"/></radialGradient>
    <radialGradient id="lobe-b"><stop offset="0" stop-color="${lobeColors[1][0]}" stop-opacity="${lobeColors[1][1]}"/><stop offset="1" stop-color="${lobeColors[1][0]}" stop-opacity="0"/></radialGradient>
    <linearGradient id="card-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4D7BAC"/><stop offset="1" stop-color="#2A3A71"/></linearGradient>
    <filter id="card-shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
      <feDropShadow dx="0" dy="${t.shadow.dy}" stdDeviation="${t.shadow.sd}" flood-color="${t.shadow.color}" flood-opacity="${t.shadow.opacity}"/>
    </filter>
${clips}
  </defs>`;
}

function background(mode) {
  const groundEl =
    mode === "light"
      ? `<rect id="ground-base" data-name="Air ground" x="0" y="0" width="${W}" height="${H}" fill="url(#ground)"/>`
      : `<g transform="translate(1100.8 57.6) scale(1 0.6075) translate(-1100.8 -57.6)">
      <rect id="ground-base" data-name="Depth ground" x="0" y="-600" width="${W}" height="2400" fill="url(#ground)"/>
    </g>`;
  /* Same arc fragment the template inlines — only the paint differs. */
  const atmos = substitutePaint(atmosphereFragment(), THEME_PAINT[mode]);
  return `
  <g id="bg" data-name="Background">
    ${groundEl}
    <ellipse id="lobe-a" data-name="Quiet lobe (right)" cx="1011.2" cy="201.6" rx="422.4" ry="331.2" fill="url(#lobe-a)"/>
    <ellipse id="lobe-b" data-name="Quiet lobe (left)" cx="268.8" cy="626.4" rx="396.8" ry="280.8" fill="url(#lobe-b)"/>
    ${atmos}
  </g>`;
}

/* The reversed-white vector lockup is the traced master artwork; emit it as
   real <path> layers (not a nested <image>) so it stays editable in Canva. */
function reversedLogoInner() {
  const raw = fs.readFileSync(LOGO_REVERSED, "utf8");
  const tf = (raw.match(/<g transform="([^"]+)"/) || [])[1] || "";
  const ds = [...raw.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const paths = ds.map((d) => `        <path d="${d}"/>`).join("\n");
  return `      <g transform="${tf}" fill="#FFFFFF" stroke="none">\n${paths}\n      </g>`;
}

function wordmark(logoUri, mode) {
  const x = PAD.x;
  const y = PAD.y;
  if (mode === "light") {
    return `  <g id="brand" data-name="Brand lockup">
    <image id="iu-logo" data-name="IU logo" href="${logoUri}" xlink:href="${logoUri}" x="${x}" y="${y}" width="${LOGO.w}" height="${n1(LOGO_H)}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
  }
  const scale = (LOGO.w / REVERSED_VIEW_W).toFixed(7);
  return `  <g id="brand" data-name="Brand lockup">
    <g id="iu-logo" data-name="IU logo (reversed)" transform="translate(${x} ${y}) scale(${scale})">
${reversedLogoInner()}
    </g>
  </g>`;
}

/* Episode chip, mirrors .eyebrow: 32px pill, 1px hairline, text centred. */
function eyebrow(L, t) {
  const label = String(L.eyebrow || "Insurance Untangled").toUpperCase();
  const pillW = Math.max(64, textWidth(G, label, "sans", CHIP.size, CHIP.track) + 2 * (CHIP.padX + 1));
  const x = W - PAD.x - pillW;
  const y = PAD.y + (LOGO_H - CHIP.h) / 2;
  /* Flex centring is not floored: the text's line box (rounded ascent +
     descent, line-height normal) sits exactly mid-way inside the hairline. */
  const asc = Math.round(G.fonts.sans.asc * CHIP.size);
  const desc = Math.round(G.fonts.sans.desc * CHIP.size);
  const base = y + 1 + (CHIP.h - 2 - asc - desc) / 2 + asc;
  return `
  <g id="eyebrow" data-name="Episode chip">
    <rect id="eyebrow-pill" data-name="Episode chip" x="${n1(x)}" y="${n1(y)}" width="${n1(pillW)}" height="${CHIP.h}" rx="${CHIP.h / 2}" fill="${t.chipBg}" stroke="${t.chipLine}" stroke-width="1"/>
    <text id="eyebrow-text" data-name="Episode chip text" x="${n1(x + CHIP.padX + 1)}" y="${n1(base)}" font-family="${SANS}" font-size="${CHIP.size}" font-weight="600" letter-spacing="${CHIP.track}" fill="${t.chipFg}">${escXml(label)}</text>
  </g>`;
}

/* Kicker + claim + petal, mirrors .lead / .title / .mark. */
function lead(L, t, mode) {
  const kickerBase = L.lead.y + baseline(G, "sans", KICKER.size, KICKER.h);
  const lineBase = baseline(G, "display", L.size, L.lineH);
  const ls = n2(L.ls);
  const title = L.lines
    .map((line, i) => {
      const base = n1(L.lead.titleY + i * L.lineH + lineBase);
      const id = `title-line-${i + 1}`;
      if (line.accent) {
        return `      <text id="${id}" data-name="Title ${i + 1}" x="${L.lead.x}" y="${base}" font-family="${SERIF}" font-style="italic" font-weight="500" font-size="${n2(L.accentSize)}" letter-spacing="${ls}" fill="${t.fg}">${escXml(line.text)}</text>`;
      }
      return `      <text id="${id}" data-name="Title ${i + 1}" x="${L.lead.x}" y="${base}" font-family="${DISPLAY}" font-weight="600" font-size="${L.size}" letter-spacing="${ls}" fill="${t.fg}">${escXml(line.text)}</text>`;
    })
    .join("\n");
  const mark = L.mark
    ? `\n    <g id="petal" data-name="Petal mark">${petalTriad({ x: L.mark.x, y: L.mark.y + L.mark.h, h: L.mark.h, paint: THEME_PAINT[mode] })}</g>`
    : "";

  return `
  <g id="lead" data-name="Lead">
    <text id="kicker" data-name="Kicker" x="${L.lead.x}" y="${n1(kickerBase)}" font-family="${SANS}" font-size="${KICKER.size}" font-weight="600" letter-spacing="${KICKER.track}" fill="${t.kicker}">${escXml(L.kicker)}</text>
    <g id="title" data-name="Title">
${title}
    </g>${mark}
  </g>`;
}

/* One named group per guest, mirrors .card: fill + shadow, picture clipped to
   the card, hairline above the picture, label docked bottom-left. */
function cards(L) {
  const parts = [];
  L.people.forEach((p, idx) => {
    const g = p.guest;
    const c = p.card;
    const num = String(idx + 1).padStart(2, "0");
    const id = `guest-${num}`;
    const href = escXml(g.img || "");
    parts.push(`  <g id="${id}" data-name="${escXml(g.name || `Guest ${num}`)}">`);
    parts.push(`    <rect id="${id}-card" data-name="Card ${num}" x="${n2(c.x)}" y="${n2(c.y)}" width="${n2(c.w)}" height="${n2(c.h)}" rx="${L.radius}" fill="url(#card-fill)" filter="url(#card-shadow)"/>`);

    const img = p.image;
    if (img.kind === "framed") {
      parts.push(`    <g clip-path="url(#${id}-clip)"><image id="${id}-photo" data-name="Headshot photo ${num}" href="${href}" xlink:href="${href}" x="${n2(img.x)}" y="${n2(img.y)}" width="${n2(img.w)}" height="${n2(img.h)}" preserveAspectRatio="none"/></g>`);
    } else if (img.kind === "cover" || img.kind === "contain") {
      const par = img.kind === "cover" ? "xMidYMid slice" : "xMidYMax meet";
      parts.push(`    <g clip-path="url(#${id}-clip)"><image id="${id}-photo" data-name="Headshot photo ${num}" href="${href}" xlink:href="${href}" x="${n2(c.x)}" y="${n2(c.y)}" width="${n2(c.w)}" height="${n2(c.h)}" preserveAspectRatio="${par}"/></g>`);
    } else {
      const m = p.mono;
      const base = m.cy - m.size / 2 + baseline(G, "display", m.size, m.size);
      parts.push(`    <text id="${id}-monogram" data-name="Monogram ${num}" x="${n2(m.cx)}" y="${n2(base)}" text-anchor="middle" font-family="${DISPLAY}" font-weight="600" font-size="${n2(m.size)}" letter-spacing="${n2(-0.02 * m.size)}" fill="#FFFFFF" fill-opacity="0.42">${escXml(m.text)}</text>`);
    }

    parts.push(`    <rect id="${id}-edge" data-name="Card edge ${num}" x="${n2(c.x + 0.5)}" y="${n2(c.y + 0.5)}" width="${n2(c.w - 1)}" height="${n2(c.h - 1)}" rx="${L.radius - 0.5}" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="1"/>`);

    const b = p.label;
    if (b) {
      const tx = b.x + 1 + b.padX;
      const nameBase = b.y + 1 + b.padY + baseline(G, "display", b.nameSize, b.nameLH);
      parts.push(`    <g id="${id}-label" data-name="Label ${num}">`);
      parts.push(`      <rect id="${id}-label-bg" data-name="Label backdrop ${num}" x="${n2(b.x)}" y="${n2(b.y)}" width="${n2(b.w)}" height="${n2(b.h)}" rx="${b.radius}" fill="#0A0F22" fill-opacity="0.72"/>`);
      parts.push(`      <rect id="${id}-label-edge" data-name="Label edge ${num}" x="${n2(b.x + 0.5)}" y="${n2(b.y + 0.5)}" width="${n2(b.w - 1)}" height="${n2(b.h - 1)}" rx="${b.radius - 0.5}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="1"/>`);
      parts.push(`      <text id="${id}-name" data-name="Name ${num}" x="${n2(tx)}" y="${n2(nameBase)}" font-family="${DISPLAY}" font-weight="600" font-size="${b.nameSize}" fill="#FFFFFF">${escXml(b.name)}</text>`);
      if (b.meta) {
        const metaBase = b.y + 1 + b.padY + b.nameLH + b.gap + baseline(G, "sans", b.metaSize, b.metaLH);
        parts.push(`      <text id="${id}-role" data-name="Role ${num}" x="${n2(tx)}" y="${n2(metaBase)}" font-family="${SANS}" font-weight="500" font-size="${b.metaSize}" fill="#FFFFFF" fill-opacity="0.74">${escXml(b.meta)}</text>`);
      }
      parts.push(`    </g>`);
    }
    parts.push(`  </g>`);
  });
  return parts.join("\n");
}

/* Copy-budget warnings: an authored line that had to wrap, a label cut short. */
function warnings(cfg, L, name) {
  const authored = (cfg.title || []).filter((f) => String(f.text ?? "").trim()).length;
  if (L.lines.length > authored) {
    console.warn(`    (${name}: a title line wraps at this column width, ${authored} authored → ${L.lines.length} rendered; shorten it)`);
  }
  for (const p of L.people) {
    if (p.label && (p.label.name.endsWith("…") || p.label.meta.endsWith("…"))) {
      console.warn(`    (${name}: label for ${p.guest.name} is cut short to fit its card; shorten role/company)`);
    }
  }
}

function buildSVG(cfg, logoUri, name = "") {
  const mode = cfg.mode === "light" ? "light" : "dark";
  const L = compose(G, cfg);
  const t = theme(mode);
  warnings(cfg, L, name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Insurance Untangled episode thumbnail, 1280×720, ${mode} theme. Layered for Canva. -->
${fontFaceCss()}
${defs(mode, L, t)}
${background(mode)}

  <g id="people" data-name="${L.band ? "Guests" : "Panel"}">
${cards(L)}
  </g>

${wordmark(logoUri, mode)}

${eyebrow(L, t)}

${lead(L, t, mode)}
</svg>
`;
}

/* Turn local image paths into self-contained data URIs so the SVG is portable. */
function embedImages(cfg) {
  for (const guest of cfg.guests || []) {
    const img = guest.img;
    if (!img || String(img).startsWith("data:")) continue;
    const p = path.resolve(__dirname, String(img));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const ext = path.extname(p).toLowerCase();
      const mime =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".gif" ? "image/gif" :
        "image/jpeg";
      guest.img = `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
      console.log(`    embedded headshot: ${path.basename(p)} (${guest.name})`);
    } else {
      console.warn(`    (headshot not found, keeping placeholder: ${img})`);
    }
  }
}

/* ------------------------------------------------------------
   CLI
   ------------------------------------------------------------ */
function expandConfigPaths(pattern) {
  const abs = path.resolve(__dirname, pattern);
  if (fs.existsSync(abs)) {
    if (fs.statSync(abs).isDirectory()) {
      return fs.readdirSync(abs).filter((f) => f.endsWith(".json")).map((f) => path.join(abs, f));
    }
    return [abs];
  }
  if (pattern.includes("*")) {
    const star = pattern.indexOf("*");
    const baseDir = path.resolve(__dirname, pattern.slice(0, star)) || __dirname;
    const prefix = pattern.slice(0, star).split(/[\\/]/).pop();
    const suffix = pattern.slice(star + 1);
    return fs
      .readdirSync(baseDir)
      .filter((f) => f.endsWith(".json") && f.startsWith(prefix) && f.endsWith(suffix))
      .map((f) => path.join(baseDir, f));
  }
  return [];
}

function loadSharp() {
  const local = createRequire(import.meta.url);
  try {
    return local("sharp");
  } catch {
    return null;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const configs = [];
  let preview = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-c") configs.push(argv[++i]);
    else if (argv[i] === "--preview") preview = true;
  }

  let files = configs.length
    ? configs.flatMap((c) => expandConfigPaths(c))
    : fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".json")).map((f) => path.join(EXAMPLES_DIR, f));
  files = files.filter((f) => fs.existsSync(f));

  if (!files.length) {
    console.error("No configs found.");
    process.exit(1);
  }

  if (!fs.existsSync(LOGO_PATH)) {
    console.error(`Missing logo: ${LOGO_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(LOGO_REVERSED)) {
    console.error(`Missing reversed logo: ${LOGO_REVERSED}`);
    process.exit(1);
  }
  const logoUri = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString("base64")}`;
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sharp = preview ? loadSharp() : null;
  if (preview && !sharp) console.warn("  (preview skipped, install sharp to rasterize)");

  for (const file of files) {
    const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    embedImages(cfg);
    const base = (cfg.output || path.basename(file, ".json")).replace(/\.png$/, "");
    const outSvg = path.join(OUT_DIR, `IU-${base}.svg`);
    const svg = buildSVG(cfg, logoUri, base);
    fs.writeFileSync(outSvg, svg);
    console.log(`✓ ${path.relative(WORKSPACE, outSvg)} (${Buffer.byteLength(svg).toLocaleString()} bytes)`);

    if (preview && sharp) {
      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const outPng = path.join(OUT_DIR, `preview-IU-${base}.png`);
      fs.writeFileSync(outPng, png);
      console.log(`  preview ${path.relative(WORKSPACE, outPng)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
