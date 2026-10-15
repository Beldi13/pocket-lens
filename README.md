# Pocket Lens

**Your Android devices, one simple desktop.** A local, open-source Windows app powered by scrcpy.

[Español](docs/README.es.md) · [Connection guide](docs/CONNECTION.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md)

Register an Android phone, choose its preferences, and open its screen with a click. Use several phones at once in independent windows. No accounts, cloud service, ads, or telemetry.

## Features

- Device library with per-device settings, verified identities and USB-first connection selection.
- Local device artwork: best-effort static wallpaper import, manual PNG/JPEG/WebP selection and the original drawing when unavailable.
- Guided USB registration, Android 11+ wireless pairing by code, manual network address, and USB-to-Wi-Fi preparation.
- mDNS discovery, permission/offline diagnostics, explicit confirmation when identity is unavailable.
- Quality presets and custom resolution, FPS, bitrate, codec, audio, clipboard and input control.
- Physical-screen on/off buttons during mirroring, fullscreen, always-on-top and initial window dimensions.
- Dual-pane PC/phone files: drag and drop, recursive copy/move, rename, folders, confirmed deletion, SHA-256 verification and cancellable jobs.
- Signed in-app updates for stable releases, with separate download and installation confirmation.
- MP4 recording from session start, unique filenames and graceful session closure.
- Spanish/English, system/light/dark appearance, tray, single instance and configurable Windows autostart.

## Install and use

Download the Windows x64 installer from [Releases](https://github.com/Beldi13/pocket-lens/releases). Windows 10/11 x64 and Android 5+ are supported. Audio forwarding requires Android 11+. WebView2 is provisioned if missing (internet required for that first-time download). Vendor USB drivers may be needed for some phones.

1. Install Pocket Lens and choose **Register device**.
2. Enable debugging and approve this computer on the phone. Use USB or the guided wireless method.
3. Select the detected device, name it and save your preferences.
4. Choose **Open screen**. Repeat for other phones.

The app opens the selector at Windows sign-in; it does not automatically open phone screens. Closing the panel keeps it in the tray. **Quit** closes its own sessions too. Closing a screen normally finalizes its MP4 recording.

Use trusted local networks for ADB over TCP/IP. Wireless debugging must remain enabled. Legacy USB-to-Wi-Fi mode may require USB preparation again after rebooting the phone. Android permissions cannot be bypassed. iPhone is not supported.

## Development

Windows prerequisites: Node.js 24, stable Rust (MSVC), Visual Studio C++ Build Tools / Desktop development with C++, Windows SDK and WebView2. If the MSVC linker is missing, install the C++ workload or use the Windows GitHub Actions build; Node or Rust alone is insufficient.

```powershell
npm ci
npm run vendor:prepare
./scripts/build-wallpaper.ps1
npm run tauri dev
```

`vendor:prepare` downloads the official scrcpy **4.1** x64 archive and verifies its pinned SHA-256. It does not use personal scripts, require a system scrcpy installation or install phone drivers. Original binaries, server and DLLs are kept together. Build dependencies are not required on end-user computers.

Building the Android helpers requires JDK 17+ and an Android SDK (`ANDROID_HOME`) with `platforms;android-35` and `build-tools;35.0.0`. `build-wallpaper.ps1` builds our MIT-licensed Java sources into DEX JARs bundled with the app; no APK is installed on the phone. CI prepares these build tools. The helper runs briefly under the already authorized ADB shell, reads only the static home wallpaper and is removed afterward. It does not take screenshots, navigate the phone or change permissions. Android 7+ and firmware support are required for automatic artwork; live or inaccessible wallpapers keep the existing drawing. One automatic attempt is made per profile; **Refresh from phone** retries explicitly. A failed refresh retains an existing image. **Remove image** restores the drawing and disables automatic reimport until the user requests another image.

```powershell
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run tauri build -- --ci --config src-tauri/tauri.verify.conf.json
```

`npm run dev` previews the interface in a browser; it explicitly reports that phone operations require the desktop app. It does not fabricate connected phones.

## Files and updates (0.3.0)

Open **Files** on a device card to browse Windows and Android shared storage side by side. Dragging copies; moving requires an explicit action. Windows deletes go to the Recycle Bin, with no permanent fallback. Android deletion is permanent and confirmed. Symbolic links/junctions are not followed. Conflicts default to keeping both; a move with skipped entries retains every original. Transfers are staged and verified by size and SHA-256 before final names are committed. Interrupted transfers do not resume automatically; cleanup is best-effort if the phone disconnects. APKs are copied without installation. Native Explorer drops are inbound to Android; dragging Android files into external Windows apps is not included.

**Preferences → Check for updates** queries only the latest stable GitHub Release. Startup checks do not block use. Download and install are separate explicit actions; recordings are finalized before installation. Install 0.3.0 manually once when upgrading from 0.2.0. The release workflow signs fixed-version installers, publishes their signature/checksum/manifest, and keeps the release draft until acceptance. Signing keys are never stored in this repository. See [release maintenance](docs/RELEASING.md).

## Privacy and storage

Profiles are saved under the current user's Tauri config directory for `dev.beldi.pocketlens` as `settings.json`. They contain device identities, addresses and preferences. Pairing codes are passed to ADB through stdin, never persisted or included in command arguments. ADB maintains its standard authorization keys locally. Session diagnostics stay in memory; recordings go only to the selected folder.

Do not publish personal settings, recordings or diagnostic logs. Forgetting a profile does not revoke Android debugging authorization; revoke it on the phone. Updates retain profiles and unknown settings versions are preserved rather than overwritten.

## Validation and roadmap

See [validation status](docs/VALIDATION.md) for tested cases and physical checks still pending. Multiple devices are supported by the process manager; real simultaneous-device validation requires two available Android devices.

Initial scope: Windows x64, independent scrcpy windows. Embedded screen grids, macOS/Linux packaging, camera mode, virtual displays, Android app launching, gaming controls are deferred.

## Credits and license

Built with Tauri 2, Rust, React, TypeScript, Vite and Lucide. Homebase Lens inspired the choice of desktop technologies; this is an independent implementation.

Pocket Lens source and original artwork: [MIT](LICENSE). scrcpy and bundled dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). This is an independent frontend, not an official Genymobile product. [scrcpy official source](https://github.com/Genymobile/scrcpy).
