# Pocket Lens

**Your Android devices, one simple desktop.** A local, open-source Windows app powered by scrcpy.

[Español](docs/README.es.md) · [Connection guide](docs/CONNECTION.md) · [Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md)

Register an Android phone, choose its preferences, and open its screen with a click. Use several phones at once in independent windows. No accounts, cloud service, ads, or telemetry.

## Features

- Device library with per-device settings, verified identities and USB-first connection selection.
- Guided USB registration, Android 11+ wireless pairing by code, manual network address, and USB-to-Wi-Fi preparation.
- mDNS discovery, permission/offline diagnostics, explicit confirmation when identity is unavailable.
- Quality presets and custom resolution, FPS, bitrate, codec, audio, clipboard and input control.
- Turn off the phone's screen while mirroring, fullscreen, always-on-top and initial window dimensions.
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
npm run tauri dev
```

`vendor:prepare` downloads the official scrcpy **4.1** x64 archive and verifies its pinned SHA-256. It does not use personal scripts, require a system scrcpy installation or install phone drivers. Original binaries, server and DLLs are kept together. Build dependencies are not required on end-user computers.

```powershell
npm run verify
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
npm run tauri build -- --ci
```

`npm run dev` previews the interface in a browser; it explicitly reports that phone operations require the desktop app. It does not fabricate connected phones.

## Privacy and storage

Profiles are saved under the current user's Tauri config directory for `dev.beldi.pocketlens` as `settings.json`. They contain device identities, addresses and preferences. Pairing codes are passed to ADB through stdin, never persisted or included in command arguments. ADB maintains its standard authorization keys locally. Session diagnostics stay in memory; recordings go only to the selected folder.

Do not publish personal settings, recordings or diagnostic logs. Forgetting a profile does not revoke Android debugging authorization; revoke it on the phone. Updates retain profiles and unknown settings versions are preserved rather than overwritten.

## Validation and roadmap

See [validation status](docs/VALIDATION.md) for tested cases and physical checks still pending. Multiple devices are supported by the process manager; real simultaneous-device validation requires two available Android devices.

Initial scope: Windows x64, independent scrcpy windows. Embedded screen grids, macOS/Linux packaging, camera mode, virtual displays, Android app launching, gaming controls and automatic updates are deferred.

## Credits and license

Built with Tauri 2, Rust, React, TypeScript, Vite and Lucide. Homebase Lens inspired the choice of desktop technologies; this is an independent implementation.

Pocket Lens source and original artwork: [MIT](LICENSE). scrcpy and bundled dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). This is an independent frontend, not an official Genymobile product. [scrcpy official source](https://github.com/Genymobile/scrcpy).
