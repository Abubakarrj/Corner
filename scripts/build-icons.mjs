// Regenerates every app icon from public/icon.svg.
//
//   npm i -D playwright && node scripts/build-icons.mjs
//
// Not wired into the build: the icons change when the logo does, which is
// rarely, and making every install pull a browser binary to redraw three PNGs
// that are already committed is a bad trade. Run it by hand after touching
// icon.svg, and commit what comes out.

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

// Rasterises the home-screen icon from the real bagel path, so the icon and
// the logo can't drift — there is one shape, in public/icon.svg, and these are
// renderings of it.
//
// Three things this does that a straight screenshot of the SVG did not:
//
//   Composes it. The path's own viewBox has the bagel off-centre with a lot
//   of slack around it, so rendering the viewBox as-is left the mark small and
//   sitting high-left. The bounding box is measured in the browser and the
//   shape is centred on it, then scaled to fill the frame the way an app icon
//   should.
//
//   Fills the hole. The bagel's hole is a subpath that knocks through to
//   whatever is behind, and on a white ground that reads as a white blob
//   floating inside the tan — a glow, not a hole. It gets its own flat tone,
//   a step down from the body. Still flat: two solid colours, no gradient.
//
//   Supersamples. Rendered at 4x and downscaled with high-quality smoothing,
//   so the curve edges are clean rather than carrying the fringe you get from
//   rasterising straight to 180px.

const OUT = new URL("../public/", import.meta.url).pathname;
const BODY = "#EFD6A6";
// One flat step down from the body. Dark enough to read as a hole at 40px on
// a home screen, close enough in hue that the icon still reads as one object.
const HOLE = "#CDB88D";
const BACKDROP = "#FFFFFF";

const source = readFileSync(`${OUT}/icon.svg`, "utf8");
const d = source.match(/ d="([^"]+)"/)?.[1];
if (!d) throw new Error("couldn't find the bagel path in icon.svg");

// The path is one `d` holding two subpaths: the bagel, then its hole. Split on
// the Z that closes the first so each can take its own fill — as one path they
// share a fill and the hole can only ever be a knockout.
const cut = d.indexOf("ZM");
if (cut === -1) throw new Error("expected the hole to be a second subpath");
const body = d.slice(0, cut + 1);
const hole = d.slice(cut + 1);

// How much of the frame the bagel fills. 0.74 leaves a margin that survives
// iOS's corner rounding and Android's maskable crop without the mark looking
// marooned in the middle.
const FILL = 0.74;
const SUPERSAMPLE = 4;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();

// Measure the bagel's real extent, rather than trusting the viewBox.
await page.setContent(
  `<svg id="s" xmlns="http://www.w3.org/2000/svg"><path id="p" d="${body}"/></svg>`,
);
const box = await page.evaluate(() => {
  const path = document.getElementById("p");
  const { x, y, width, height } = path.getBBox();
  return { x, y, width, height };
});

// A square viewBox centred on that extent, sized so the longer side of the
// bagel takes FILL of it.
const span = Math.max(box.width, box.height) / FILL;
const vx = box.x + box.width / 2 - span / 2;
const vy = box.y + box.height / 2 - span / 2;

function svg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vx} ${vy} ${span} ${span}" shape-rendering="geometricPrecision">
  <rect x="${vx}" y="${vy}" width="${span}" height="${span}" fill="${BACKDROP}"/>
  <path d="${body}" fill="${BODY}"/>
  <path d="${hole}" fill="${HOLE}"/>
</svg>`;
}

async function render(size) {
  return page.evaluate(
    async ({ markup, size, scale }) => {
      const big = size * scale;
      const img = new Image();
      img.width = big;
      img.height = big;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      });

      // Draw large, then step down once with high-quality smoothing. The
      // browser's downscaler averages the supersampled pixels, which is what
      // makes the curve edges clean instead of stair-stepped.
      const hi = document.createElement("canvas");
      hi.width = big;
      hi.height = big;
      const hiCtx = hi.getContext("2d");
      hiCtx.drawImage(img, 0, 0, big, big);

      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(hi, 0, 0, size, size);
      return out.toDataURL("image/png");
    },
    { markup: svg(size * SUPERSAMPLE), size, scale: SUPERSAMPLE },
  );
}

function pngBuffer(dataUrl) {
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

for (const [name, size] of [
  ["apple-touch-icon.png", 180],
  ["icon-192.png", 192],
  ["icon-512.png", 512],
]) {
  writeFileSync(`${OUT}${name}`, pngBuffer(await render(size)));
  console.log(`${name} ${size}x${size}`);
}

// The browser tab icon, from the same artwork so the tab and the home screen
// don't show two different bagels.
//
// PNG-in-ICO rather than the BMP form the old file used. Every browser in use
// has read it since Vista, the file is a fifth of the size, and it means the
// same rendering path produces every icon instead of a second one that has to
// agree with the first.
const ICO_SIZES = [16, 32, 48];
const images = [];
for (const size of ICO_SIZES) images.push({ size, png: pngBuffer(await render(size)) });

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

const directory = Buffer.alloc(16 * images.length);
let offset = header.length + directory.length;
images.forEach(({ size, png }, index) => {
  const at = index * 16;
  directory.writeUInt8(size, at); // width, 0 meaning 256
  directory.writeUInt8(size, at + 1); // height
  directory.writeUInt8(0, at + 2); // palette size, 0 for truecolour
  directory.writeUInt8(0, at + 3); // reserved
  directory.writeUInt16LE(1, at + 4); // colour planes
  directory.writeUInt16LE(32, at + 6); // bits per pixel
  directory.writeUInt32LE(png.length, at + 8);
  directory.writeUInt32LE(offset, at + 12);
  offset += png.length;
});

const ico = Buffer.concat([header, directory, ...images.map((image) => image.png)]);
// Two copies on purpose: Next serves app/favicon.ico at /favicon.ico, and the
// one in public/ is what anything linking to it directly resolves to.
writeFileSync(`${OUT}favicon.ico`, ico);
writeFileSync(new URL("../app/favicon.ico", import.meta.url).pathname, ico);
console.log(`favicon.ico ${ICO_SIZES.join("/")} — ${ico.length}b`);

await browser.close();
