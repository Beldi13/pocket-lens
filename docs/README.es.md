# Pocket Lens

**Tus celulares, desde un solo escritorio.** Aplicación local y de código abierto para Windows, impulsada por scrcpy.

[English](../README.md) · [Conexión](CONNECTION.md) · [Contribuir](../CONTRIBUTING.md)

## Empezar

1. Descarga e instala la versión para Windows x64 desde [Releases](https://github.com/Beldi13/pocket-lens/releases).
2. Abre **Registrar dispositivo** y elige USB, Wi‑Fi mediante código o preparación de Wi‑Fi por USB.
3. Activa la depuración y acepta los permisos en el celular. Selecciona el dispositivo detectado.
4. Ponle un nombre, elige tus preferencias y guarda.
5. Pulsa **Abrir pantalla**. Puedes abrir varios celulares a la vez, cada uno en su propia ventana.

La aplicación muestra el selector al iniciar sesión en Windows. Puedes desactivar el autoinicio desde Preferencias. Cerrar el panel lo oculta en la bandeja; **Salir** cierra sus sesiones. Cerrar una pantalla normalmente finaliza su grabación MP4.

## Configuración por celular

Guarda calidad, FPS, bitrate, códec, audio, control de teclado y mouse, portapapeles, apagado de pantalla física, mantener despierto mientras carga, tamaño de ventana, pantalla completa, siempre visible y grabación al iniciar sesión.

Preajustes: Ligero (1280 px/30 FPS/4 Mbps), Equilibrado (1920 px/60 FPS/8 Mbps), Alta calidad (resolución original/60 FPS/16 Mbps) y Mi Pova 5 (H.265/60 FPS/16 Mbps/pantalla apagada/ventana 390 × 850). Cada ajuste se puede cambiar. Los cambios se aplican al abrir de nuevo la pantalla.

## Compatibilidad y conexión

Windows 10/11 de 64 bits. Android 5 o superior; audio desde Android 11 y vinculación inalámbrica moderna desde Android 11. Algunos fabricantes requieren controladores USB u opciones adicionales de depuración. No admite iPhone.

La aplicación no evita los permisos de Android. Por Wi‑Fi ambos equipos deben estar en la misma red y la depuración debe seguir habilitada. El modo preparado por USB puede requerir repetirse después de reiniciar el teléfono. Si la IP cambia y mDNS no permite localizarlo, introduce la nueva dirección y asóciala con su registro existente.

## Privacidad

Sin cuentas, nube, anuncios ni telemetría. Las preferencias se guardan en el equipo; los códigos de vinculación no se guardan. Las grabaciones van a la carpeta que elijas. No publiques archivos de configuración ni grabaciones personales. Olvidar un dispositivo en la app no revoca sus permisos en Android.

## Desarrollo

Consulta los comandos y requisitos en el [README principal](../README.md). Las herramientas C++ de Visual Studio y el SDK de Windows son necesarios para compilar Rust/Tauri en Windows; GitHub Actions ofrece un entorno Windows ya preparado. El usuario final no necesita Node, Rust ni esas herramientas.

Código propio bajo MIT. scrcpy y sus dependencias conservan sus licencias. Consulta [avisos de terceros](../THIRD_PARTY_NOTICES.md) y [estado de validación](VALIDATION.md).
