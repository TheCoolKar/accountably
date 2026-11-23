// Regenerates every icon and header logo from the brand artwork in brand/.
//
//   node scripts/make-icons.mjs
//
// Sources (replace these to rebrand, then run this script):
//   brand/icon.png        the app icon, rounded square on a transparent background
//   brand/logo-light.png  icon + "Accountably" in navy, transparent: for light backgrounds
//   brand/logo-dark.png   icon + "Accountably" in white, transparent: for dark backgrounds

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const at = (relative) => fileURLToPath(new URL(relative, import.meta.url));
mkdirSync(at("../public/icons/"), { recursive: true });
mkdirSync(at("../public/brand/"), { recursive: true });

const SIZE = 1024;
const icon = await sharp(at("../brand/icon.png")).resize(SIZE, SIZE).ensureAlpha().toBuffer();

// Phones crop home-screen icons to their own shape, so those need artwork
// that fills the whole square. Rebuild the icon's gradient from its four
// corners and lay the icon on top, leaving no transparent corners to show.
const { data } = await sharp(icon).raw().toBuffer({ resolveWithObject: true });
const colourAt = (x, y) => [...data.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3)];
const inset = 170;
const far = SIZE - inset;
const corners = Buffer.from(
  [colourAt(inset, inset), colourAt(far, inset), colourAt(inset, far), colourAt(far, far)].flat(),
);
const gradient = await sharp(corners, { raw: { width: 2, height: 2, channels: 3 } })
  .resize(SIZE, SIZE, { kernel: "cubic" })
  .png()
  .toBuffer();
// The artwork's outermost few pixels are a pale anti-aliasing fringe that
// would show as a faint outline on the gradient, so pull its edge in slightly
// before laying it on top.
const softAlpha = await sharp(icon).extractChannel("alpha").blur(4).raw().toBuffer();
const pulledIn = Buffer.from(data);
for (let i = 0; i < SIZE * SIZE; i++) {
  pulledIn[i * 4 + 3] = Math.max(0, Math.min(255, (softAlpha[i] - 205) * 6));
}
const seamless = await sharp(pulledIn, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png()
  .toBuffer();
const fullBleed = await sharp(gradient).composite([{ input: seamless }]).png().toBuffer();

// Android's "maskable" crop can be a circle that keeps only the middle 80%,
// so the artwork is shrunk to sit inside that.
const shrunk = await sharp(seamless).resize(Math.round(SIZE * 0.82)).toBuffer();
const maskable = await sharp(gradient).composite([{ input: shrunk, gravity: "centre" }]).png().toBuffer();

// Android draws the notification badge from the image's shape only, so keep
// just the bright "A" and make everything else transparent.
const grey = await sharp(icon).removeAlpha().greyscale().raw().toBuffer();
const shape = Buffer.alloc(SIZE * SIZE * 4, 255);
for (let i = 0; i < SIZE * SIZE; i++) {
  // Only inside the artwork: its pale outer fringe is not part of the "A".
  const inside = pulledIn[i * 4 + 3] >= 200;
  shape[i * 4 + 3] = inside ? Math.max(0, Math.min(255, (grey[i] - 120) * 4)) : 0;
}
const badge = sharp(shape, { raw: { width: SIZE, height: SIZE, channels: 4 } });

await sharp(icon).resize(192).png().toFile(at("../public/icons/icon-192.png"));
await sharp(icon).resize(512).png().toFile(at("../public/icons/icon-512.png"));
await sharp(maskable).resize(512).png().toFile(at("../public/icons/icon-maskable-512.png"));
await badge.resize(96).png().toFile(at("../public/icons/badge-96.png"));
// Next.js serves these two as the browser tab icon and the iPhone home-screen icon.
await sharp(icon).resize(64).png().toFile(at("../app/icon.png"));
await sharp(fullBleed).resize(180).png().toFile(at("../app/apple-icon.png"));

// Header logos: trimmed of empty margin, three times the 32px they are shown
// at so they stay sharp on phone screens.
for (const name of ["logo-light", "logo-dark"]) {
  await sharp(at(`../brand/${name}.png`))
    .trim()
    .resize({ height: 96 })
    .png({ compressionLevel: 9 })
    .toFile(at(`../public/brand/${name}.png`));
}
console.log("icons and logos written");
