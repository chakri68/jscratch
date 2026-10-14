// Renders the committed PNGs from their SVG sources. Run with `npm run icons`.
// Text in full.svg is already outlined, so no system fonts are involved.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const media = fileURLToPath(new URL("../media/", import.meta.url));
const jobs = [
  ["icon.svg", "icon.png", 256],
  ["full.svg", "full.png", 1280],
];

for (const [src, out, width] of jobs) {
  const svg = readFileSync(media + src, "utf8");
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  writeFileSync(media + out, png);
  console.log(`${src} -> ${out} (${width}px wide)`);
}
