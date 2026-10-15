export interface AppError {
  code: string;
  message: string;
}
export interface MirrorOptions {
  turnScreenOff: boolean;
  stayAwake: boolean;
  audio: boolean;
  control: boolean;
  clipboard: boolean;
  maxSize: number;
  maxFps: number;
  bitRate: number;
  codec: string;
  windowWidth: number;
  windowHeight: number;
  fullscreen: boolean;
  alwaysOnTop: boolean;
  record: boolean;
  recordingDirectory: string;
}
export interface DeviceProfile {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdk: number;
  identity: string | null;
  usbSerials: string[];
  endpoints: string[];
  mdnsNames: string[];
  options: MirrorOptions;
  artwork?: string | null;
  artworkAutoAttempted?: boolean;
}
export interface DetectedDevice {
  serial: string;
  state: string;
  transport: string;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdk: number;
  identity: string | null;
}
export interface MdnsService {
  name: string;
  kind: string;
  endpoint: string;
}
export interface Discovery {
  devices: DetectedDevice[];
  services: MdnsService[];
  warning: string | null;
}
export interface AppPreferences {
  language: string;
  theme: string;
  autostartInitialized: boolean;
  fileDirectories?: Record<string, string>;
}
export interface Settings {
  version: number;
  profiles: DeviceProfile[];
  preferences: AppPreferences;
}
export interface SessionStatus {
  profileId: string;
  state: string;
  serial: string;
  recordingPath: string | null;
  error: AppError | null;
}
export interface DeviceStatus {
  profileId: string;
  state: string;
  serial: string | null;
  transport: string | null;
}
export interface AppSnapshot {
  settings: Settings;
  discovery: Discovery;
  sessions: SessionStatus[];
  devices: DeviceStatus[];
  autostart: boolean;
  engineVersion: string;
}
export type FileSide = "local" | "phone";
export interface FileEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "link" | "other";
  size: number;
  modified: number;
}
export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
}
export interface FileRequest {
  profileId: string;
  operation: "copy" | "move" | "delete";
  sourceSide: FileSide;
  paths: string[];
  targetSide: FileSide;
  targetDirectory: string;
  confirmedSerial: string | null;
}
export interface FileJob {
  id: string;
  profileId: string;
  operation: string;
  state: string;
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
  current: string;
  skipped: number;
  conflict: { source: string; target: string; kind: string } | null;
  error: AppError | null;
  created: number;
}
export interface UpdateStatus {
  state: string;
  version: string | null;
  notes: string;
  downloaded: number;
  total: number | null;
  error: AppError | null;
}
export const defaultOptions: MirrorOptions = {
  turnScreenOff: false,
  stayAwake: false,
  audio: true,
  control: true,
  clipboard: true,
  maxSize: 1920,
  maxFps: 60,
  bitRate: 8,
  codec: "h264",
  windowWidth: 0,
  windowHeight: 0,
  fullscreen: false,
  alwaysOnTop: false,
  record: false,
  recordingDirectory: "",
};
export type Preset = "light" | "balanced" | "quality" | "personal";
export function applyPreset(
  options: MirrorOptions,
  preset: Preset,
): MirrorOptions {
  const quality = {
    light: { maxSize: 1280, maxFps: 30, bitRate: 4 },
    balanced: { maxSize: 1920, maxFps: 60, bitRate: 8 },
    quality: { maxSize: 0, maxFps: 60, bitRate: 16 },
    personal: { maxSize: 0, maxFps: 60, bitRate: 16 },
  }[preset];
  return {
    ...options,
    ...quality,
    codec: preset === "personal" ? "h265" : "h264",
    ...(preset === "personal"
      ? {
          turnScreenOff: true,
          control: true,
          windowWidth: 390,
          windowHeight: 850,
        }
      : {}),
  };
}
export function asError(value: unknown): AppError {
  return typeof value === "object" &&
    value &&
    "code" in value &&
    "message" in value
    ? (value as AppError)
    : { code: "unknown", message: String(value) };
}
export function profileMatches(
  profile: DeviceProfile,
  device: DetectedDevice,
): boolean {
  return (
    !!(
      profile.identity &&
      device.identity &&
      profile.identity === device.identity
    ) ||
    (!profile.identity &&
      !device.identity &&
      device.transport === "usb" &&
      profile.usbSerials.includes(device.serial))
  );
}
