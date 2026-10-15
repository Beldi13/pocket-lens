import { workspaceEs, workspaceEn } from "./workspace-i18n";
const es = {
  ...workspaceEs,
  artworkTitle: "Imagen del dispositivo",
  artworkHint:
    "Intentamos obtener el fondo original al conectar. Si Android no lo permite, se mantiene el dibujo. Los cambios de imagen se guardan al instante, solo en tu computadora.",
  artworkRefresh: "Actualizar desde el celular",
  artworkChoose: "Elegir imagen",
  artworkRemove: "Quitar imagen",
  artworkSaved: "Imagen guardada.",
  artworkRemoved:
    "Se usará el dibujo original. Puedes volver a elegir una imagen cuando quieras.",
  artworkUnavailable:
    "Android no proporcionó un fondo estático. Conservamos la imagen anterior o el dibujo original.",
  error_artwork_invalid:
    "Elige una imagen PNG, JPEG o WebP válida de hasta 20 MB.",
  devices: "Mis dispositivos",
  settings: "Preferencias",
  help: "Guía de conexión",
  tagline: "Tu Android, más cerca.",
  workspace: "ESPACIO PERSONAL",
  powered: "Impulsado por scrcpy",
  local: "Todo ocurre en tu equipo",
  eyebrow: "TU ESCRITORIO, CONECTADO",
  title: "Un pequeño puente.",
  titleAccent: "Muchas posibilidades.",
  subtitle:
    "Mira, controla y disfruta tus dispositivos Android desde tu computadora.",
  add: "Registrar dispositivo",
  library: "Tu biblioteca",
  libraryDesc:
    "Una configuración para cada celular. Un clic para volver a conectar.",
  saved: "registrados",
  available: "Disponibles",
  active: "En pantalla",
  disconnected: "Sin conexión",
  unauthorized: "Permiso pendiente",
  offline: "No responde",
  availableOne: "Disponible",
  running: "En pantalla",
  starting: "Abriendo…",
  stopping: "Cerrando…",
  closed: "Sesión cerrada",
  error: "Revisar conexión",
  open: "Abrir pantalla",
  reconnect: "Conectar",
  close: "Cerrar pantalla",
  configure: "Configurar",
  forget: "Olvidar dispositivo",
  forgetQuestion: "¿Olvidar este dispositivo?",
  forgetDetail:
    "Se eliminarán su registro y preferencias de Pocket Lens. Los permisos concedidos en Android se administran desde el teléfono.",
  cancel: "Cancelar",
  confirm: "Confirmar",
  save: "Guardar cambios",
  done: "Guardar dispositivo",
  next: "Continuar",
  back: "Atrás",
  emptyTitle: "Tu primer dispositivo está a un paso",
  emptyDesc:
    "Conecta tu Android por USB o vincúlalo por Wi‑Fi. Te acompañamos en cada paso.",
  usbOrWifi: "USB o Wi‑Fi",
  multiple: "Varios dispositivos",
  noAccount: "Sin cuentas ni nube",
  nearby: "Dispositivos detectados",
  nearbyDesc: "Conectados a ADB y todavía fuera de tu biblioteca.",
  refresh: "Buscar de nuevo",
  searching: "Buscando…",
  noNearby: "No hay dispositivos nuevos por ahora.",
  first: "Conecta tu Android",
  firstDesc: "Elige cómo quieres registrar el dispositivo.",
  stepConnection: "Conexión",
  stepPreferences: "Tu configuración",
  usb: "Cable USB",
  wifi: "Wi‑Fi sin cable",
  prepare: "Preparar Wi‑Fi por USB",
  usbGuide:
    "Activa Opciones de desarrollador → Depuración USB. Conecta un cable de datos, desbloquea el celular y acepta «Permitir depuración USB».",
  wifiGuide:
    "En Android 11 o superior, activa Depuración inalámbrica. Elige «Vincular con código» e introduce aquí la dirección y el código que muestra el celular.",
  prepareGuide:
    "Conecta el celular por USB y ambos equipos a la misma red. Pocket Lens habilitará ADB por TCP/IP para que puedas retirar el cable. Usa una red de confianza; este método puede requerir repetirse tras reiniciar el teléfono.",
  pairAddress: "Dirección de vinculación",
  code: "Código de 6 dígitos",
  pair: "Vincular",
  paired:
    "Vinculado. Ahora conecta usando la dirección principal de Depuración inalámbrica; su puerto puede ser diferente.",
  connectAddress: "Dirección de conexión",
  connect: "Conectar",
  addressHint:
    "Ejemplo: 192.168.1.20:37123. Usa el puerto que muestra tu teléfono.",
  services: "Servicios Wi‑Fi encontrados",
  choose: "Seleccionar",
  noDetected: "Conecta el celular y pulsa Buscar de nuevo.",
  prepareButton: "Preparar y comprobar Wi‑Fi",
  name: "Nombre del dispositivo",
  devicePreferences: "Hazlo tuyo",
  preferencesDesc:
    "Estas preferencias se guardan para este dispositivo y se aplican al abrir su pantalla.",
  association: "Asociar con un registro existente",
  newDevice: "Crear un registro nuevo",
  associationHint:
    "Selecciona un registro solo si confirmas que es el mismo celular. Una identidad distinta impedirá la asociación.",
  unknownIdentity:
    "Android no proporciona una identidad estable. Confirma que seleccionaste el celular correcto; al reconectar por Wi‑Fi se solicitará confirmación.",
  identityConfirm: "Confirmo que este es el dispositivo que quiero registrar.",
  preset: "Punto de partida",
  light: "Ligero",
  balanced: "Equilibrado",
  quality: "Alta calidad",
  personal: "Mi Pova 5",
  display: "Pantalla y control",
  turnScreenOff: "Apagar pantalla del celular al conectar",
  screenOffHint: "La imagen seguirá visible en tu computadora.",
  stayAwake: "Mantener despierto mientras carga",
  audio: "Reproducir audio en la computadora",
  audioHint: "Disponible desde Android 11; algunas apps restringen su audio.",
  control: "Controlar con teclado y mouse",
  clipboard: "Sincronizar portapapeles",
  advanced: "Calidad y ventana",
  maxSize: "Resolución máxima (px)",
  original: "0 = original",
  maxFps: "FPS máximos",
  bitrate: "Bitrate (Mbps)",
  codec: "Códec de video",
  width: "Ancho de ventana (px)",
  height: "Alto de ventana (px)",
  automatic: "0 = automático",
  fullscreen: "Abrir en pantalla completa",
  alwaysOnTop: "Mantener ventana siempre visible",
  recording: "Grabación",
  record: "Grabar al abrir la sesión",
  recordHint:
    "Se crea un MP4 nuevo por sesión. Para finalizarlo, cierra la pantalla normalmente.",
  recordingFolder: "Carpeta de grabaciones",
  browse: "Elegir carpeta",
  restartHint: "Los cambios se aplicarán la próxima vez que abras la pantalla.",
  preferencesTitle: "A tu manera",
  preferencesSubtitle: "Un espacio cómodo, desde el primer clic.",
  language: "Idioma",
  theme: "Apariencia",
  system: "Seguir al sistema",
  dark: "Oscuro",
  lightTheme: "Claro",
  startup: "Mostrar mis dispositivos al iniciar Windows",
  startupHint:
    "Se abre el selector. Las pantallas se abren solo cuando tú lo eliges.",
  trayHint:
    "Al cerrar esta ventana, Pocket Lens queda en la bandeja. «Salir» cierra también sus sesiones.",
  quit: "Salir de Pocket Lens",
  guideTitle: "De tu bolsillo a tu escritorio",
  guideSubtitle:
    "Una primera conexión guiada. Después, tu dispositivo te espera en la biblioteca.",
  guide1: "Prepara tu Android",
  guide1Desc:
    "Activa Opciones de desarrollador y Depuración USB, o Depuración inalámbrica para la vinculación Wi‑Fi.",
  guide2: "Registra y personaliza",
  guide2Desc:
    "Acepta los permisos en el celular, ponle un nombre y elige cómo quieres usarlo.",
  guide3: "Abre tantas pantallas como necesites",
  guide3Desc:
    "Cada celular abre su propia ventana. Cerrar una pantalla no afecta las demás.",
  troubleshooting: "Si no puedes conectar",
  troubleshootingText:
    "Revisa el cable de datos y el permiso del celular. Por Wi‑Fi, comprueba que ambos equipos estén en la misma red y que la depuración siga activa. Si cambió la IP, usa el registro para asociar la nueva conexión. Una red que bloquea mDNS requiere dirección manual.",
  privacy: "Local, libre y tuyo",
  privacyText:
    "Sin cuentas, anuncios ni telemetría. Perfiles en tu computadora; imagen y control mediante ADB y scrcpy. Compatible con Android 5 o superior; algunas funciones requieren versiones más recientes.",
  source: "Código fuente",
  diagnostics: "Diagnóstico de sesión",
  details: "Detalles técnicos",
  dismiss: "Cerrar aviso",
  savedMessage: "Configuración guardada.",
  registeredMessage: "Dispositivo guardado. Ya puedes abrir su pantalla.",
  browserOnly:
    "La conexión a celulares funciona en la aplicación de escritorio. Esta vista del navegador solo permite revisar la interfaz.",
  engineError: "No se pudo consultar ADB.",
  mdnsWarning:
    "El descubrimiento Wi‑Fi no está disponible. Puedes usar una dirección manual.",
  identityTitle: "Confirma qué celular abrir",
  identityDetail:
    "No se pudo verificar automáticamente su identidad. Selecciona el dispositivo correcto para esta sesión.",
  chooseDevice: "Selecciona un dispositivo",
  recordingSaved: "Grabación de esta sesión",
  androidAudio: "Este Android no admite reenvío de audio; se abrirá sin audio.",
  error_not_found:
    "No encontramos el dispositivo. Revisa la conexión o vuelve a registrarlo para actualizar su dirección.",
  error_unauthorized:
    "Desbloquea el celular y acepta el permiso de depuración.",
  error_offline:
    "El dispositivo no responde. Reconecta el cable o revisa la depuración inalámbrica.",
  error_pair_failed:
    "No se pudo vincular. Genera un código nuevo y comprueba el puerto de vinculación.",
  error_pair_code:
    "Introduce el código de seis dígitos que muestra el celular.",
  error_invalid_address:
    "Usa una dirección válida con puerto, por ejemplo 192.168.1.20:5555.",
  error_connection:
    "No se pudo conectar. Comprueba la red, la dirección y la depuración.",
  error_timeout:
    "El dispositivo tardó demasiado en responder. Revisa su conexión y vuelve a intentarlo.",
  error_identity_mismatch:
    "La identidad corresponde a otro celular. Selecciona el dispositivo correcto.",
  error_recording_directory:
    "Elige una carpeta de grabaciones existente y con permiso de escritura.",
  error_codec:
    "El codificador no pudo iniciar. Prueba H.264 o el preajuste Ligero.",
  error_session_active:
    "Este celular tiene una sesión abierta o en proceso. Ciérrala antes de continuar.",
  error_invalid_options:
    "Revisa los valores de calidad y ventana. Las opciones de energía requieren control del dispositivo.",
  error_forced_close:
    "La sesión no respondió al cierre. La grabación podría estar incompleta.",
  error_unknown:
    "No se pudo completar la acción. Revisa los detalles y vuelve a intentarlo.",
};
const en: Record<keyof typeof es, string> = {
  ...workspaceEn,
  artworkTitle: "Device image",
  artworkHint:
    "We try to read the original wallpaper when connected. If Android does not allow it, the drawing stays. Image changes are saved immediately, only on your computer.",
  artworkRefresh: "Refresh from phone",
  artworkChoose: "Choose image",
  artworkRemove: "Remove image",
  artworkSaved: "Image saved.",
  artworkRemoved:
    "The original drawing will be used. You can choose another image whenever you like.",
  artworkUnavailable:
    "Android did not provide a static wallpaper. Your previous image or the original drawing is kept.",
  error_artwork_invalid: "Choose a valid PNG, JPEG or WebP image up to 20 MB.",
  devices: "My devices",
  settings: "Preferences",
  help: "Connection guide",
  tagline: "Your Android, a little closer.",
  workspace: "PERSONAL SPACE",
  powered: "Powered by scrcpy",
  local: "Everything stays on your computer",
  eyebrow: "YOUR DESKTOP, CONNECTED",
  title: "A little bridge.",
  titleAccent: "Endless possibilities.",
  subtitle: "See, control and enjoy your Android devices from your computer.",
  add: "Register device",
  library: "Your library",
  libraryDesc: "Settings for every phone. One click to connect again.",
  saved: "registered",
  available: "Available",
  active: "On screen",
  disconnected: "Disconnected",
  unauthorized: "Permission needed",
  offline: "Not responding",
  availableOne: "Available",
  running: "On screen",
  starting: "Opening…",
  stopping: "Closing…",
  closed: "Session closed",
  error: "Check connection",
  open: "Open screen",
  reconnect: "Connect",
  close: "Close screen",
  configure: "Configure",
  forget: "Forget device",
  forgetQuestion: "Forget this device?",
  forgetDetail:
    "Its Pocket Lens profile and preferences will be removed. Manage Android debugging permissions on the phone.",
  cancel: "Cancel",
  confirm: "Confirm",
  save: "Save changes",
  done: "Save device",
  next: "Continue",
  back: "Back",
  emptyTitle: "Your first device is one step away",
  emptyDesc:
    "Connect your Android by USB or pair over Wi-Fi. We will guide you through it.",
  usbOrWifi: "USB or Wi-Fi",
  multiple: "Multiple devices",
  noAccount: "No accounts or cloud",
  nearby: "Detected devices",
  nearbyDesc: "Connected to ADB and not yet in your library.",
  refresh: "Scan again",
  searching: "Scanning…",
  noNearby: "No new devices right now.",
  first: "Connect your Android",
  firstDesc: "Choose how to register your device.",
  stepConnection: "Connection",
  stepPreferences: "Your setup",
  usb: "USB cable",
  wifi: "Wireless Wi-Fi",
  prepare: "Prepare Wi-Fi via USB",
  usbGuide:
    "Enable Developer options → USB debugging. Connect a data cable, unlock your phone and accept “Allow USB debugging”.",
  wifiGuide:
    "On Android 11 or later, enable Wireless debugging. Choose “Pair using pairing code” and enter the address and code shown on the phone.",
  prepareGuide:
    "Connect your phone by USB and both devices to the same network. Pocket Lens will enable ADB over TCP/IP so you can unplug the cable. Use a trusted network; you may need to repeat this after rebooting the phone.",
  pairAddress: "Pairing address",
  code: "Six-digit code",
  pair: "Pair",
  paired:
    "Paired. Now connect using the main Wireless debugging address; its port may be different.",
  connectAddress: "Connection address",
  connect: "Connect",
  addressHint: "Example: 192.168.1.20:37123. Use the port shown on your phone.",
  services: "Discovered Wi-Fi services",
  choose: "Select",
  noDetected: "Connect your phone and select Scan again.",
  prepareButton: "Prepare and verify Wi-Fi",
  name: "Device name",
  devicePreferences: "Make it yours",
  preferencesDesc:
    "These preferences are saved for this device and applied when you open its screen.",
  association: "Link to an existing profile",
  newDevice: "Create a new profile",
  associationHint:
    "Only select a profile if you confirm this is the same phone. A different identity will prevent linking.",
  unknownIdentity:
    "Android did not provide a stable identity. Confirm that you selected the correct phone; Wi-Fi reconnections will require confirmation.",
  identityConfirm: "I confirm this is the device I want to register.",
  preset: "Start with a preset",
  light: "Light",
  balanced: "Balanced",
  quality: "High quality",
  personal: "My Pova 5",
  display: "Display and control",
  turnScreenOff: "Turn phone screen off when connecting",
  screenOffHint: "Its image will remain visible on your computer.",
  stayAwake: "Stay awake while charging",
  audio: "Play audio on the computer",
  audioHint: "Available on Android 11+; some apps restrict audio capture.",
  control: "Control with keyboard and mouse",
  clipboard: "Synchronize clipboard",
  advanced: "Quality and window",
  maxSize: "Maximum resolution (px)",
  original: "0 = original",
  maxFps: "Maximum FPS",
  bitrate: "Bitrate (Mbps)",
  codec: "Video codec",
  width: "Window width (px)",
  height: "Window height (px)",
  automatic: "0 = automatic",
  fullscreen: "Open in fullscreen",
  alwaysOnTop: "Keep window always on top",
  recording: "Recording",
  record: "Record when the session opens",
  recordHint:
    "A new MP4 is created for each session. Close the screen normally to finalize it.",
  recordingFolder: "Recording directory",
  browse: "Choose directory",
  restartHint: "Changes apply the next time you open the screen.",
  preferencesTitle: "Make yourself at home",
  preferencesSubtitle: "A comfortable space, from the first click.",
  language: "Language",
  theme: "Appearance",
  system: "Follow system",
  dark: "Dark",
  lightTheme: "Light",
  startup: "Show my devices when Windows starts",
  startupHint: "Opens the device selector. Screens only open when you choose.",
  trayHint:
    "Closing this window keeps Pocket Lens in the system tray. “Quit” also closes its sessions.",
  quit: "Quit Pocket Lens",
  guideTitle: "From your pocket to your desktop",
  guideSubtitle:
    "A guided first connection. Then your device is waiting in your library.",
  guide1: "Prepare your Android",
  guide1Desc:
    "Enable Developer options and USB debugging, or Wireless debugging for Wi-Fi pairing.",
  guide2: "Register and personalize",
  guide2Desc:
    "Accept permissions on the phone, give it a name and choose how you want to use it.",
  guide3: "Open as many screens as you need",
  guide3Desc:
    "Each phone opens in its own window. Closing one screen does not affect the others.",
  troubleshooting: "If you cannot connect",
  troubleshootingText:
    "Check your data cable and phone permissions. For Wi-Fi, check both devices are on the same network and debugging is still enabled. If the IP changed, use registration to link the new connection. Networks blocking mDNS require a manual address.",
  privacy: "Local, open and yours",
  privacyText:
    "No accounts, ads or telemetry. Profiles stay on your computer; ADB and scrcpy handle video and control. Supports Android 5+; some features require newer versions.",
  source: "Source code",
  diagnostics: "Session diagnostics",
  details: "Technical details",
  dismiss: "Dismiss",
  savedMessage: "Settings saved.",
  registeredMessage: "Device saved. You can now open its screen.",
  browserOnly:
    "Phone connections work in the desktop application. This browser view is for reviewing the interface only.",
  engineError: "Could not query ADB.",
  mdnsWarning:
    "Wi-Fi discovery is unavailable. You can enter an address manually.",
  identityTitle: "Confirm which phone to open",
  identityDetail:
    "Its identity could not be verified automatically. Select the correct device for this session.",
  chooseDevice: "Select a device",
  recordingSaved: "Recording for this session",
  androidAudio:
    "This Android version does not support audio forwarding; it will open without audio.",
  error_not_found:
    "Device not found. Check the connection or register it again to update its address.",
  error_unauthorized: "Unlock your phone and accept the debugging permission.",
  error_offline:
    "Device is not responding. Reconnect the cable or check wireless debugging.",
  error_pair_failed:
    "Could not pair. Generate a new code and check the pairing port.",
  error_pair_code: "Enter the six-digit code shown on your phone.",
  error_invalid_address:
    "Use a valid address with port, for example 192.168.1.20:5555.",
  error_connection:
    "Could not connect. Check the network, address and debugging settings.",
  error_timeout:
    "The device took too long to respond. Check its connection and try again.",
  error_identity_mismatch:
    "This identity belongs to a different phone. Select the correct device.",
  error_recording_directory:
    "Choose an existing recording directory with write access.",
  error_codec: "The encoder could not start. Try H.264 or the Light preset.",
  error_session_active:
    "This phone already has an open or pending session. Close it before continuing.",
  error_invalid_options:
    "Check quality and window values. Power options require device control.",
  error_forced_close:
    "The session did not respond to closing. Its recording may be incomplete.",
  error_unknown:
    "Could not complete the action. Check the details and try again.",
};
export type Key = keyof typeof es;
export type Language = "es" | "en";
export function translator(language: Language) {
  const dictionary = language === "en" ? en : es;
  return (key: Key) => dictionary[key];
}
export type Translate = ReturnType<typeof translator>;
export function errorText(code: string, t: Translate) {
  const key = `error_${code}` as Key;
  return key in es ? t(key) : t("error_unknown");
}
