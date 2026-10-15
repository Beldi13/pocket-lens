# Connection / Conexión

## USB

Enable Android Developer options and USB debugging, connect a data cable, unlock the phone and approve the RSA prompt. An unauthorized device stays visible but cannot be registered until permission is accepted. Try a different cable or the manufacturer's USB driver if it is absent.

Activa Opciones de desarrollador y Depuración USB. Conecta un cable de datos, desbloquea y acepta el permiso. Si aparece «Permiso pendiente», primero acepta en el celular; no basta con marcar una casilla en Pocket Lens.

## Wireless pairing / Vinculación inalámbrica (Android 11+)

Both devices must be on the same local network. In Wireless debugging, choose pairing by code. Enter the pairing address and six-digit code in Pocket Lens. Then use the **connection** address from the main Wireless debugging page: its port differs from the pairing port. Discovered connection services can be selected instead. Generate a new code after expiry or failure.

En Depuración inalámbrica, elige vincular con código. Introduce esa dirección y el código. Después usa la dirección de **conexión** de la pantalla principal; su puerto suele ser diferente. Si la red bloquea mDNS, escríbela manualmente.

## Prepare Wi-Fi via USB / Preparar Wi‑Fi por USB

Connect an authorized USB phone to the same network as the computer. Pocket Lens reads its Wi-Fi address, enables `adb tcpip 5555` on that phone only, connects and verifies identity. Remove the cable after verification. This legacy mode may reset after reboot and should only be used on trusted networks.

Conecta el celular autorizado por USB y a la misma red. La app obtiene su dirección, habilita TCP/IP en ese dispositivo, conecta y verifica su identidad. Quita el cable después de la comprobación. Puede requerir repetirse al reiniciar el celular.

## Changed address / Nueva dirección

Register the newly connected endpoint. A verified identical identity updates the existing profile. If Android exposes no stable identity, explicitly select the old profile only when you know it is the same physical phone. A conflicting known identity is rejected. Wi-Fi opening without stable identity requires a device selection for that session. An IP address or model is never sufficient proof.

Registra la nueva conexión y asóciala con el registro anterior. La app verifica la identidad y rechaza una distinta. Si Android no proporciona una identidad estable, solicita confirmación explícita. Una IP o modelo coincidente no demuestra que sea el mismo teléfono.

## Troubleshooting

- **No device:** check cable, Wi-Fi, debugging, USB drivers and phone lock screen.
- **Offline / unauthorized:** reconnect and approve permissions on the phone.
- **Pairing failed:** use a fresh six-digit code and the pairing port, not the connection port.
- **Codec failure:** switch to H.264 or Light quality, then reopen the session.
- **Recording error:** choose an existing writable folder. Finish via Close screen or the scrcpy window's close button.
- **Other ADB tools:** Pocket Lens does not issue global kill-server, kill-adb-on-close or process-name termination. Avoid mixing incompatible ADB client versions with other tools.

References: [Android Debug Bridge](https://developer.android.com/tools/adb), [scrcpy connection documentation](https://github.com/Genymobile/scrcpy/blob/v4.1/doc/connection.md).
