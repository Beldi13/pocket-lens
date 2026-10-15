# Architecture

React/TypeScript owns presentation and transient wizard state. Tauri commands are the only device-operation interface. Rust owns verified device discovery, settings, connection and one managed scrcpy child per physical device. No HTTP server or VBS launcher is needed.

## Contracts

`DeviceProfile` persists identity, transport aliases, descriptive metadata and `MirrorOptions`. IPs and model names are hints only. `DeviceStatus` describes current availability. `SessionStatus` is keyed by profile and records lifecycle, selected transport, recording path and actionable errors. `AppPreferences` stores language, theme and first-run autostart initialization; Windows remains the source of truth for autostart enablement.

Commands: snapshot, discover, connect_device, pair_device, prepare_wifi, register_device, edit_device, forget_device, open_device, close_device, save_preferences, session_diagnostics, open_source and exit_app. Guest bindings are centralized in `src/api.ts`. Events: devices://changed, session://changed and engine://error. A snapshot provides reconciliation after events or reopening the window.

## Identity and launch

Authorized getprop values supply ro.serialno / ro.boot.serialno. Unavailable or placeholder identities require explicit association, with a verified USB serial usable locally. Known identity conflicts are rejected. Saved mDNS service names and endpoints are reconnect hints, followed by identity checks. USB is preferred. No subnet-wide port scanning occurs.

Registration re-reads the selected device instead of trusting stale UI state. A launch gate prevents competing profile launches from opening the same physical phone twice. Every invocation selects its serial explicitly and supplies structured process arguments without a command shell. Pairing codes go through stdin. Normal application startup only discovers devices; it never opens their screens automatically.

## Lifecycle

The backend drains bounded in-memory stdout/stderr per child. Duplicate requests are blocked while opening. Closing sends WM_CLOSE only to windows owned by that child PID, waits for recording finalization, then terminates that child only if unresponsive. The UI distinguishes a forced close because MP4 finalization may be incomplete. No global ADB or scrcpy termination is used.

Closing the main window hides it. Tray Quit / Exit closes owned sessions, then exits. A single-instance plugin reveals the existing window. Window visibility is excluded from restored window state so sign-in displays the selector.

## Storage and packaging

Versioned settings are saved by temp-file replacement after validation; unknown versions and unreadable settings are not overwritten. Pairing secrets are never serialized. The whole official Windows scrcpy directory is shipped as Tauri resources so its DLL/server layout remains intact. Development uses the local ignored vendor directory; release resolves the installed resource directory. SHA-256 is pinned; dependency versions are locked.

No private Homebase Lens modules, profiles or credentials are imported. Native code and artwork in this repository are independent.
