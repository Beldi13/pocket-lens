# Third-party notices

Pocket Lens is an independent frontend, not an official Genymobile application.

The Windows installer includes the **unmodified official scrcpy 4.1 Windows x64 distribution**, including adb, scrcpy-server, SDL, FFmpeg libraries and libusb. Its original LICENSE.txt and bundled notices are retained. Download and SHA-256 are pinned in scripts/prepare-vendor.mjs.

- scrcpy: Copyright Genymobile and Romain Vimont; Apache-2.0. Source, license and release: https://github.com/Genymobile/scrcpy/tree/v4.1
- Android Debug Bridge (adb): Android Open Source Project; Apache-2.0 and its third-party components. Source: https://android.googlesource.com/platform/packages/modules/adb/
- SDL 3: zlib license. https://github.com/libsdl-org/SDL
- FFmpeg: LGPL-2.1-or-later for the upstream Windows build configuration, with corresponding source and build instructions at https://github.com/Genymobile/scrcpy/tree/v4.1/app/deps and https://ffmpeg.org/legal.html . Users may replace the dynamically loaded FFmpeg DLLs with compatible modified versions. Pocket Lens imposes no restriction on reverse engineering for debugging modifications to these libraries.
- libusb: LGPL-2.1-or-later. https://github.com/libusb/libusb
- dav1d 1.5.3 (statically linked into FFmpeg): BSD-2-Clause. https://code.videolan.org/videolan/dav1d
- zlib: zlib license. https://zlib.net/
- Tauri, React, Vite, Lucide and other Rust/JavaScript dependencies retain their respective licenses. Their exact versions are recorded in Cargo.lock and package-lock.json.

The MIT license for Pocket Lens applies to its own source and artwork, not to third-party binaries. The verified archive is fetched at build time; binaries and personal device data are not committed to the source repository.

The installer includes full library license texts and Android's third-party NOTICE.txt under `scrcpy/licenses`. The matching FFmpeg 8.1.2 and libusb 1.0.30 source archives and upstream build recipes are distributed as `pocket-lens-third-party-sources.zip` alongside every installer in GitHub Releases. Source checksums are pinned to the official scrcpy build recipes. No modifications are made to these libraries.
