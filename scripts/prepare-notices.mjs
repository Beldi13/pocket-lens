import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, ".cache");
const notices = path.join(root, "src-tauri/vendor/scrcpy/licenses");
const sources = path.join(cache, "third-party-sources");
await mkdir(notices, { recursive: true });
await mkdir(sources, { recursive: true });
await mkdir(path.join(root, "artifacts"), { recursive: true });
async function download(url, output, checksum) {
  let bytes;
  try {
    bytes = await readFile(output);
  } catch {
    /* First build. */
  }
  if (
    !bytes ||
    (checksum && createHash("sha256").update(bytes).digest("hex") !== checksum)
  ) {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Could not fetch ${url}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (
      checksum &&
      createHash("sha256").update(bytes).digest("hex") !== checksum
    )
      throw new Error(`Checksum mismatch: ${url}`);
    await writeFile(output, bytes);
  }
  return {
    url,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    file: path.basename(output),
  };
}
const licenseFiles = [
  [
    "FFmpeg-LGPL-2.1.txt",
    "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/COPYING.LGPLv2.1",
  ],
  [
    "FFmpeg-LICENSE.md",
    "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1.2/LICENSE.md",
  ],
  [
    "libusb-COPYING.txt",
    "https://raw.githubusercontent.com/libusb/libusb/v1.0.30/COPYING",
  ],
  [
    "SDL-LICENSE.txt",
    "https://raw.githubusercontent.com/libsdl-org/SDL/release-3.4.12/LICENSE.txt",
  ],
  [
    "dav1d-COPYING.txt",
    "https://raw.githubusercontent.com/videolan/dav1d/1.5.3/COPYING",
  ],
  [
    "zlib-license-header.txt",
    "https://raw.githubusercontent.com/madler/zlib/v1.3.1/zlib.h",
  ],
];
await Promise.all(
  licenseFiles.map(([name, url]) => download(url, path.join(notices, name))),
);
const adbArchive = path.join(cache, "platform-tools_r37.0.0-win.zip");
await download(
  "https://dl.google.com/android/repository/platform-tools_r37.0.0-win.zip",
  adbArchive,
  "4fe305812db074cea32903a489d061eb4454cbc90a49e8fea677f4b7af764918",
);
const adbNotice = spawnSync(
  "tar.exe",
  ["-xOf", adbArchive, "platform-tools/NOTICE.txt"],
  { windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
if (adbNotice.status !== 0)
  throw new Error(
    `Cannot extract Android third-party notices: ${adbNotice.stderr}`,
  );
await writeFile(path.join(notices, "Android-NOTICE.txt"), adbNotice.stdout);
const manifest = await Promise.all([
  download(
    "https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz",
    path.join(sources, "ffmpeg-8.1.2.tar.xz"),
    "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c",
  ),
  download(
    "https://github.com/libusb/libusb/archive/refs/tags/v1.0.30.tar.gz",
    path.join(sources, "libusb-1.0.30.tar.gz"),
    "2ae28adb0bb9558c86135c4e1c11b320b0805461e207a64a6e520a114094bf07",
  ),
]);
for (const filename of ["ffmpeg.sh", "libusb.sh", "_init", "README"]) {
  await download(
    `https://raw.githubusercontent.com/Genymobile/scrcpy/2926c06c5dc3064ae6d8db706f1a98a37cfcf3f0/app/deps/${filename}`,
    path.join(sources, `scrcpy-deps-${filename}`),
  );
}
await writeFile(
  path.join(sources, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
await writeFile(
  path.join(sources, "README.txt"),
  "Corresponding LGPL library sources for the unmodified official scrcpy 4.1 Windows x64 bundle. FFmpeg 8.1.2 and libusb 1.0.30 sources and checksums are provided alongside the upstream scrcpy dependency build recipes. Full build environment and instructions: https://github.com/Genymobile/scrcpy/tree/v4.1 . Compatible modified FFmpeg/libusb DLLs can replace the installed copies.\n",
);
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const archive = path.join(
  root,
  "artifacts/pocket-lens-third-party-sources.zip",
);
const result = spawnSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `Compress-Archive -Path ${quote(path.join(sources, "*"))} -DestinationPath ${quote(archive)} -Force`,
  ],
  { windowsHide: true, stdio: "inherit" },
);
if (result.status !== 0)
  throw new Error("Could not package corresponding sources");
console.log(
  "Third-party licenses, Android notices and corresponding LGPL sources prepared.",
);
