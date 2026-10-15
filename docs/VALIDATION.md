# Validation status

This document records actual verification, not assumptions about hardware coverage.

## Automated checks

- Frontend wizard: unauthorized device gating, selected-device save, custom preferences, expired pairing codes and secret clearing, failed manual connection, ambiguous identity confirmation.
- Profile behavior: presets preserve recording preferences, disabling control clears incompatible power settings, same-model/IP identity separation.
- Rust: settings replacement and unknown version preservation; endpoint validation; ADB permission/offline parsing; pairing vs connection ports; stable identity parsing; explicit target and literal arguments; recording uniqueness and invalid directories; codec error classification.
- Windows workflow runs frontend verification, rustfmt, Rust tests, Clippy, native app and NSIS installer build.

## Physical acceptance matrix

| Check | Status |
| --- | --- |
| Pova 5 Wi-Fi detection | ADB detects an authorized device on the development laptop |
| Register / reopen / persist through app | Pending installed-build verification |
| Screen off while mirroring | Pending installed-build verification |
| MP4 graceful finalization and decoding | Pending installed-build verification |
| Mouse/keyboard interaction and audible playback | Pending physical verification |
| Modern pairing with a fresh phone code | Pending phone-side interaction |
| USB registration and USB-to-Wi-Fi setup | Pending USB-connected device |
| Two phones at once; close one without affecting the other | Pending second physical Android device |
| Sign-in selector after Windows restart | Pending actual Windows sign-in |
| Profile retained on installer upgrade | Pending installer verification |

Opt-in diagnostic binary (not included as a user-facing app) exercises a real device only when explicitly supplied a serial and output directory. It creates local recordings and isolated settings; do not upload its output or personal logs to the repository.
