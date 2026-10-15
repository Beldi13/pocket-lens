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

En **Configurar → Imagen del dispositivo** puedes actualizar el fondo desde el celular, elegir un PNG/JPEG/WebP de hasta 20 MB o quitar la imagen para volver al dibujo original. Estos cambios se guardan al instante. La app intenta obtener el fondo estático una vez al detectar el dispositivo autorizado; si Android o el fabricante no lo permiten, conserva el dibujo. Los fondos animados no se exportan. Quitar la imagen impide su reimportación automática. Las miniaturas se reducen y guardan solo en la configuración local, sin capturas de pantalla ni servicios externos. La importación automática requiere Android 7 o superior y compatibilidad del teléfono; el resto de funciones mantiene sus requisitos anteriores.

## Pantalla, archivos y actualizaciones (0.3.0)

Durante una sesión con control habilitado puedes **Encender pantalla** o **Apagar pantalla** sin cerrarla ni cambiar el ajuste inicial guardado. Los atajos son Alt izquierdo + Mayús + O y Alt izquierdo + O. No se muestra un estado físico supuesto: son acciones explícitas.

Pulsa **Archivos** en la tarjeta para abrir **Esta PC** y **Celular** lado a lado. Puedes navegar, filtrar, ordenar, seleccionar varios elementos, crear carpetas, renombrar, copiar, mover y eliminar. Arrastrar entre paneles o desde el Explorador al celular copia; mover requiere confirmación. Los APK se copian sin instalar. Solo se accede al almacenamiento compartido disponible para ADB. No se siguen enlaces ni uniones.

Los archivos se escriben en temporales y se verifican por tamaño y SHA-256. Los conflictos proponen **Conservar ambos**. Si un movimiento omite parte de la selección, se conservan todos los originales. En Windows el borrado usa la Papelera; un fallo no se convierte en borrado definitivo. En Android se confirma el borrado permanente. Las operaciones interrumpidas no se reanudan automáticamente; si el teléfono se desconecta, retirar temporales puede quedar pendiente. El arrastre hacia aplicaciones externas desde Android queda fuera de esta versión.

En **Preferencias → Buscar actualizaciones** se consultan únicamente versiones estables. También se comprueba al abrir, sin bloquear el uso. La app avisa y ofrece descargar; después debes confirmar **Instalar y reiniciar**. Se verifican firma y versión, se cierran las sesiones y se finalizan las grabaciones antes de instalar. Los perfiles, imágenes, preferencias y autoinicio se conservan. Desde 0.2.0 debes instalar 0.3.0 manualmente una vez.

## Compatibilidad y conexión

Windows 10/11 de 64 bits. Android 5 o superior; audio desde Android 11 y vinculación inalámbrica moderna desde Android 11. Algunos fabricantes requieren controladores USB u opciones adicionales de depuración. No admite iPhone.

La aplicación no evita los permisos de Android. Por Wi‑Fi ambos equipos deben estar en la misma red y la depuración debe seguir habilitada. El modo preparado por USB puede requerir repetirse después de reiniciar el teléfono. Si la IP cambia y mDNS no permite localizarlo, introduce la nueva dirección y asóciala con su registro existente.

## Privacidad

Sin cuentas, nube, anuncios ni telemetría. Las preferencias se guardan en el equipo; los códigos de vinculación no se guardan. Las grabaciones van a la carpeta que elijas. No publiques archivos de configuración ni grabaciones personales. Olvidar un dispositivo en la app no revoca sus permisos en Android.

## Desarrollo

Consulta los comandos y requisitos en el [README principal](../README.md). Las herramientas C++ de Visual Studio y el SDK de Windows son necesarios para compilar Rust/Tauri en Windows; GitHub Actions ofrece un entorno Windows ya preparado. El usuario final no necesita Node, Rust ni esas herramientas.

Código propio bajo MIT. scrcpy y sus dependencias conservan sus licencias. Consulta [avisos de terceros](../THIRD_PARTY_NOTICES.md) y [estado de validación](VALIDATION.md).
