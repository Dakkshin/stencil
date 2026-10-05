/**
 * core/svg.mjs and core/chromium.mjs: the helpers every format leans on. The Chrome
 * launch test is the only one that needs a browser; it proves Playwright resolves from
 * stencil/node_modules with no reach into another project.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { escXml, mimeOf, fileDataUri, fontFaceCss } from "../core/svg.mjs";
import { launch, loadSharp } from "../core/chromium.mjs";

test("escXml escapes the five XML specials", () => {
  assert.equal(escXml(`a & b < c > d " e ' f`), "a &amp; b &lt; c &gt; d &quot; e &apos; f");
  assert.equal(escXml(null), "");
});

test("data URIs take their MIME type from the extension", () => {
  assert.equal(mimeOf("x.svg"), "image/svg+xml");
  assert.equal(mimeOf("x.PNG"), "image/png");
  assert.equal(mimeOf("x.jpeg"), "image/jpeg");
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "svg-")), "a.svg");
  fs.writeFileSync(f, "<svg/>");
  assert.equal(fileDataUri(f), `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`);
});

test("fontFaceCss embeds each face as base64 woff2", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fonts-"));
  fs.writeFileSync(path.join(dir, "a.woff2"), "AB");
  const css = fontFaceCss([{ family: "Inter", weight: 400, file: "a.woff2" }], dir);
  assert.match(css, /font-family:"Inter";font-weight:400;font-style:normal;src:url\(data:font\/woff2;base64,QUI=\)/);
});

test("Chrome launches and sharp loads from this repo", async () => {
  assert.ok(loadSharp(), "sharp should resolve from stencil/node_modules");
  const browser = await launch();
  const page = await browser.newPage();
  assert.equal(await page.evaluate(() => 1 + 1), 2);
  await browser.close();
});
