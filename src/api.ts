import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AppSnapshot,
  DetectedDevice,
  DeviceProfile,
  Discovery,
  MirrorOptions,
  SessionStatus,
} from "./types";
export const desktop = isTauri();
export const api = {
  snapshot: () => invoke<AppSnapshot>("snapshot"),
  discover: () => invoke<Discovery>("discover"),
  connect: (endpoint: string) =>
    invoke<DetectedDevice>("connect_device", { endpoint }),
  pair: (endpoint: string, code: string) =>
    invoke<void>("pair_device", { endpoint, code }),
  prepare: (serial: string) =>
    invoke<DetectedDevice>("prepare_wifi", { serial }),
  register: (
    serial: string,
    name: string,
    options: MirrorOptions,
    associateId: string | null,
  ) =>
    invoke<DeviceProfile>("register_device", {
      serial,
      name,
      options,
      associateId,
    }),
  edit: (id: string, name: string, options: MirrorOptions) =>
    invoke<void>("edit_device", { id, name, options }),
  forget: (id: string) => invoke<void>("forget_device", { id }),
  open: (id: string, confirmedSerial: string | null = null) =>
    invoke<SessionStatus>("open_device", { id, confirmedSerial }),
  close: (id: string) => invoke<void>("close_device", { id }),
  preferences: (language: string, theme: string, autostart: boolean) =>
    invoke<void>("save_preferences", { language, theme, autostart }),
  diagnostics: (id: string) => invoke<string>("session_diagnostics", { id }),
  exit: () => invoke<void>("exit_app"),
  source: () => invoke<void>("open_source"),
};
