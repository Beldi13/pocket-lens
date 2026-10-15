import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#172f30"/><stop offset="1" stop-color="#0c191c"/></linearGradient><linearGradient id="m" x2="1" y2="1"><stop stop-color="#b4f0b5"/><stop offset="1" stop-color="#59cbb1"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#b)"/><rect x="115" y="95" width="195" height="320" rx="43" fill="none" stroke="url(#m)" stroke-width="26"/><path d="M179 131h66" stroke="#93dfb8" stroke-width="14" stroke-linecap="round"/><circle cx="304" cy="280" r="89" fill="#10292c" stroke="url(#m)" stroke-width="24"/><path d="m369 347 50 51" stroke="#a8e9ba" stroke-width="27" stroke-linecap="round"/><path d="m271 281 23 23 43-49" fill="none" stroke="#b8efc4" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
await mkdir("public", { recursive: true });
await mkdir("src-tauri/icons", { recursive: true });
await writeFile("public/pocket-lens.svg", svg);
for (const [name, size] of [
  ["32x32", 32],
  ["128x128", 128],
  ["128x128@2x", 256],
  ["icon", 512],
]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`src-tauri/icons/${name}.png`);
}
await writeFile(
  "src-tauri/icons/icon.ico",
  await pngToIco(["src-tauri/icons/icon.png"]),
);
console.log("Pocket Lens brand assets generated.");
