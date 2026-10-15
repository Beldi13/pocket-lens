import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, readdir, cp } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = "4.1";
const sha256 =
  "5b12172b3264b2889f4583ee64752ce832e29bc8b1089dca81093459697165db";
const cache = path.join(root, ".cache");
const archive = path.join(cache, `scrcpy-win64-v${version}.zip`);
await mkdir(cache, { recursive: true });
let data;
try {
  data = await readFile(archive);
} catch {
  /* Download on first build. */
}
if (!data || createHash("sha256").update(data).digest("hex") !== sha256) {
  const response = await fetch(
    `https://github.com/Genymobile/scrcpy/releases/download/v${version}/scrcpy-win64-v${version}.zip`,
  );
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  data = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(data).digest("hex") !== sha256)
    throw new Error("scrcpy checksum mismatch");
  await writeFile(archive, data);
}
const destination = path.join(root, "src-tauri", "vendor", "scrcpy");
await mkdir(destination, { recursive: true });
if (process.platform !== "win32")
  throw new Error("Vendor preparation currently requires Windows PowerShell.");
const extraction = path.join(cache, "scrcpy-extracted");
await mkdir(extraction, { recursive: true });
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extraction)} -Force`,
  ],
  { stdio: "inherit", windowsHide: true },
);
if (result.status !== 0) throw new Error("Could not extract scrcpy");
const entries = await readdir(extraction, { withFileTypes: true });
const source = entries.find(
  (entry) => entry.isDirectory() && entry.name === `scrcpy-win64-v${version}`,
);
if (!source) throw new Error("Unexpected scrcpy archive layout");
for (const entry of await readdir(path.join(extraction, source.name))) {
  await cp(
    path.join(extraction, source.name, entry),
    path.join(destination, entry),
    { recursive: true },
  );
}
await cp(
  path.join(root, "THIRD_PARTY_NOTICES.md"),
  path.join(destination, "POCKET_LENS_THIRD_PARTY_NOTICES.md"),
);
await writeFile(
  path.join(destination, "bundle-manifest.json"),
  JSON.stringify(
    {
      version,
      sha256,
      source: `https://github.com/Genymobile/scrcpy/releases/tag/v${version}`,
    },
    null,
    2,
  ),
);
if (!path.resolve(extraction).startsWith(path.resolve(cache) + path.sep)) {
  throw new Error("Extraction cleanup must stay inside the project cache");
}
await rm(extraction, { recursive: true, force: true });
console.log(`Official scrcpy ${version} bundle verified and prepared.`);
