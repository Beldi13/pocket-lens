import { invoke, isTauri } from "@tauri-apps/api/core";
import type {
  AppSnapshot,
  DetectedDevice,
  DeviceProfile,
  Discovery,
  MirrorOptions,
  SessionStatus,
  DirectoryListing,
  FileJob,
  FileSide,
  FileRequest,
  UpdateStatus,
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
  updateArtwork: (id: string, path: string | null = null) =>
    invoke<boolean>("update_artwork", { id, path }),
  removeArtwork: (id: string) => invoke<void>("remove_artwork", { id }),
  open: (id: string, confirmedSerial: string | null = null) =>
    invoke<SessionStatus>("open_device", { id, confirmedSerial }),
  close: (id: string) => invoke<void>("close_device", { id }),
  screenPower: (id: string, on: boolean) =>
    invoke<void>("screen_power", { id, on }),
  fileDefaults: (id: string) =>
    invoke<[string, string]>("file_defaults", { id }),
  fileJobs: () => invoke<FileJob[]>("file_jobs"),
  listFiles: (
    id: string,
    side: FileSide,
    path: string,
    confirmedSerial: string | null = null,
  ) =>
    invoke<DirectoryListing>("list_files", { id, side, path, confirmedSerial }),
  editFile: (
    id: string,
    side: FileSide,
    directory: string,
    name: string,
    source: string | null,
    confirmedSerial: string | null = null,
  ) =>
    invoke<void>("edit_file", {
      id,
      side,
      directory,
      name,
      source,
      confirmedSerial,
    }),
  startFileJob: (request: FileRequest) =>
    invoke<FileJob>("start_file_job", { request }),
  cancelFileJob: (id: string) => invoke<void>("cancel_file_job", { id }),
  resolveFileConflict: (id: string, choice: string, all: boolean) =>
    invoke<void>("resolve_file_conflict", { id, choice, all }),
  updateStatus: () => invoke<UpdateStatus>("update_status"),
  checkUpdates: () => invoke<UpdateStatus>("check_updates"),
  downloadUpdate: () => invoke<UpdateStatus>("download_update"),
  installUpdate: (cancelJobs: boolean) =>
    invoke<void>("install_update", { cancelJobs }),
  preferences: (language: string, theme: string, autostart: boolean) =>
    invoke<void>("save_preferences", { language, theme, autostart }),
  diagnostics: (id: string) => invoke<string>("session_diagnostics", { id }),
  exit: (cancelJobs = false) => invoke<void>("exit_app", { cancelJobs }),
  source: () => invoke<void>("open_source"),
};
