# Releases / Publicaciones

## English

1. Update all app versions and bilingual release notes; run frontend verification, Rust tests, rustfmt and Clippy. The Windows workflow also builds both Android helpers and NSIS.
2. Signing setup is a one-time maintainer operation: `scripts/configure-signing.ps1`. It creates an encrypted key outside the repository under the maintainer's `.tauri/pocket-lens`, saves a user-bound DPAPI password backup, embeds only the public key, and sets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` GitHub secrets. Keep a separate secure recovery backup; do not regenerate a key for routine releases. Changing it breaks verification by installed clients.
3. Push a matching `vMAJOR.MINOR.PATCH` tag. The workflow uses signing secrets only for tagged builds, verifies the tag/package version, generates fixed-version HTTPS URLs in `latest.json`, and uploads installer, updater signature, SHA-256 and source notices to a draft Release. Tags with a suffix are marked prerelease. Only published stable Releases are returned by the app's GitHub `/releases/latest` endpoint.
4. `scripts/check-update.ps1` builds an isolated application with a throwaway key, separate identifier and installer registration. It verifies a signed 0.3.0 → 0.3.1 NSIS update, restart, profile/preferences/image preservation. Its localhost HTTP endpoint and diagnostics hook are excluded from production builds. Generated keys/installers stay in ignored `.cache`; never upload them as release assets.
5. Download and verify the production artifact's SHA-256. Complete the physical acceptance matrix, then publish the complete draft with `gh release edit vVERSION --draft=false --latest` for stable releases. Do not promote a failed or incomplete build.

The 0.2.0 client requires a manual installation of 0.3.0 once. Later versions check, notify, download only on request, then install only after explicit confirmation. Never delete user configuration during an upgrade. Do not upload personal settings, wallpapers, recordings or phone logs.

## Español

Actualiza las versiones y notas bilingües, ejecuta las verificaciones y deja pasar el flujo Windows. La clave privada se genera una sola vez fuera del repositorio, con copia de recuperación protegida y secretos de GitHub; en la app se incluye únicamente la clave pública. Conserva la clave entre versiones.

Una etiqueta `vMAJOR.MINOR.PATCH` genera instalador firmado, firma, SHA-256 y `latest.json` con URL HTTPS de versión fija. Se suben todos los archivos a una Release en borrador. Las etiquetas con sufijo son preliminares. Publica la estable solo después de comprobar el instalador y la matriz física. El cliente consulta únicamente la última Release estable publicada.

La prueba de actualización usa otra aplicación, otra identidad de instalador y una clave desechable. Comprueba firma, instalación, reinicio y conservación de perfiles, preferencias e imagen. Sus archivos de prueba no se publican. Desde 0.2.0 se instala 0.3.0 manualmente una vez; las siguientes actualizaciones requieren confirmar descarga e instalación. Nunca borres la configuración al actualizar ni publiques datos personales de las pruebas.
