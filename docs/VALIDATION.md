# Validation status

This document records actual verification, not assumptions about hardware coverage.

## Automated checks

- Version 0.2.0 passed 13 frontend tests and 18 Rust tests, lint, type checking, rustfmt, Clippy, Java/DEX compilation and NSIS packaging in [Windows build 2185e86](https://github.com/Beldi13/pocket-lens/actions/runs/38788049600).
- Device-artwork coverage includes drawing/image-load fallback, unavailable wallpaper retention, cancelled image selection, sanitized local image loading, removal/write-error behavior, bounded raster decoding and backwards-compatible per-profile persistence.
- Windows build `4f2a788` passed 8 frontend tests, 15 Rust tests, ESLint, TypeScript/Vite, rustfmt, Clippy and NSIS packaging in [GitHub Actions](https://github.com/Beldi13/pocket-lens/actions/runs/38774064589).
- Frontend wizard: unauthorized device gating, selected-device save, custom preferences, expired pairing codes and secret clearing, failed manual connection, ambiguous identity confirmation.
- Profile behavior: presets preserve recording preferences, disabling control clears incompatible power settings, same-model/IP identity separation.
- Rust: settings replacement and unknown version preservation; endpoint validation; ADB permission/offline parsing; pairing vs connection ports; stable identity parsing; explicit target and literal arguments; recording uniqueness and invalid directories; codec error classification.
- Windows workflow runs frontend verification, rustfmt, Rust tests, Clippy, native app and NSIS installer build.

## Physical acceptance matrix

| Check                                                     | Status                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Pova 5 Wi-Fi detection                                    | Passed with an authorized Android 14 device; legacy and modern Wi-Fi endpoints resolve to one profile |
| Register / reopen / persist through app                   | Registration passed in installed app; native diagnostic passed session open, duplicate prevention, close and reopen |
| Screen off while mirroring                                | Passed on Pova 5; Android display state confirmed OFF during mirroring |
| MP4 graceful finalization and decoding                    | Passed native-session recording and full FFmpeg decode; separate capture included an Opus audio track |
| Mouse/keyboard interaction and audible playback           | Pending physical verification                              |
| Modern pairing with a fresh phone code                    | Pending phone-side interaction                             |
| USB registration and USB-to-Wi-Fi setup                   | Pending USB-connected device                               |
| Two phones at once; close one without affecting the other | Pending second physical Android device                     |
| Sign-in selector after Windows restart                    | Pending actual Windows sign-in                             |
| Profile retained on installer upgrade                     | Passed 0.1.0 → 0.2.0 upgrade: profile count, IDs, identities, names and all mirror options retained |
| Library action visible when opening the installed app    | Passed compact layout at initial window size without scrolling |
| Disconnected device / failed reconnect                    | Passed installed app: bounded failure and actionable Spanish notice; no scrcpy child launched |
| Original wallpaper automatically shown in device card    | Passed installed 0.2.0 with Pova 5 / Android 14; visually verified inside phone illustration |
| Artwork persistence, removal and no automatic reimport   | Passed isolated native physical diagnostic; original static wallpaper available; temporary helper removed; no mirroring session opened |

The installed 0.2.0 image controls were visually verified in Spanish. Firmware rejection and live-wallpaper handling retain the original drawing or a previously chosen image; these paths are covered by frontend behavior tests, but physical testing of another manufacturer's device, a live wallpaper and older Android versions remains pending. Personal wallpapers and diagnostic settings are kept local and are not release assets.

The final installer was verified against its CI SHA-256 before silent per-user installation. The desktop and Start menu shortcuts and Windows autostart registry entry were verified. An actual Windows sign-in was not performed. Phone mirroring was validated earlier through the native engine diagnostic; during final visual verification the phone was unavailable, so launching a live session from the installed library remains pending. Mouse/keyboard interaction and audible playback are not inferred from enabled options or the presence of an audio track.

Installed 0.2.0 artifact SHA-256: `de89e0da66fb8ba4f6ef3fda70e9400829dbc7038b66109bdc0df91df66e360e`.

Opt-in diagnostic binary (not included as a user-facing app) exercises a real device only when explicitly supplied a serial and output directory. It creates local recordings and isolated settings; do not upload its output or personal logs to the repository.
