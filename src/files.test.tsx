import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileBrowser, FileJobs } from "./files";
import { translator } from "./i18n";
import { api } from "./api";
import { defaultOptions } from "./types";
import type { AppSnapshot, FileJob } from "./types";
const native = vi.hoisted(() => ({
  drop: null as
    | null
    | ((e: {
        payload: {
          type: string;
          paths: string[];
          position: { x: number; y: number };
        };
      }) => void),
}));
vi.mock("./api", () => ({
  desktop: true,
  api: {
    fileDefaults: vi.fn(),
    listFiles: vi.fn(),
    startFileJob: vi.fn(),
    editFile: vi.fn(),
    cancelFileJob: vi.fn(),
    resolveFileConflict: vi.fn(),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn(async (handler) => {
      native.drop = handler;
      return () => {};
    }),
  }),
}));
const t = translator("es");
const snapshot: AppSnapshot = {
  settings: {
    version: 1,
    profiles: [
      {
        id: "p",
        name: "Test phone",
        model: "Android",
        manufacturer: "Test",
        androidVersion: "14",
        sdk: 34,
        identity: "test",
        usbSerials: [],
        endpoints: [],
        mdnsNames: [],
        options: defaultOptions,
      },
    ],
    preferences: {
      language: "es",
      theme: "system",
      autostartInitialized: true,
    },
  },
  discovery: { devices: [], services: [], warning: null },
  devices: [],
  sessions: [],
  autostart: true,
  engineVersion: "4.1",
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
  native.drop = null;
  vi.mocked(api.fileDefaults).mockResolvedValue([
    "C:\\Downloads",
    "/sdcard/Download",
  ]);
  vi.mocked(api.listFiles).mockImplementation(async (_id, side, path) => ({
    path,
    parent: side === "phone" ? "/sdcard" : "C:\\",
    entries:
      side === "local"
        ? [
            {
              name: "app.apk",
              path: "C:\\Downloads\\app.apk",
              kind: "file",
              size: 12,
              modified: 1,
            },
          ]
        : [
            {
              name: "Fotos Ñ",
              path: "/sdcard/Download/Fotos Ñ",
              kind: "directory",
              size: 0,
              modified: 1,
            },
            {
              name: "notas.txt",
              path: "/sdcard/Download/notas.txt",
              kind: "file",
              size: 5,
              modified: 1,
            },
          ],
  }));
  vi.mocked(api.startFileJob).mockResolvedValue({} as FileJob);
  vi.mocked(api.editFile).mockResolvedValue();
  vi.mocked(api.resolveFileConflict).mockResolvedValue();
});
async function browser() {
  const view = render(
    <FileBrowser
      profileId="p"
      snapshot={snapshot}
      t={t}
      onProfileChange={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  await screen.findByRole("button", { name: "app.apk" });
  await screen.findByRole("button", { name: "Fotos Ñ" });
  return view;
}
describe("dual-pane file manager", () => {
  it("copies an APK as a file to the explicitly selected phone destination", async () => {
    await browser();
    fireEvent.click(screen.getByRole("checkbox", { name: "Esta PC: app.apk" }));
    fireEvent.click(
      screen.getByRole("button", { name: `Esta PC: ${t("fileCopy")}` }),
    );
    await waitFor(() =>
      expect(api.startFileJob).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: "p",
          operation: "copy",
          sourceSide: "local",
          targetSide: "phone",
          paths: ["C:\\Downloads\\app.apk"],
          targetDirectory: "/sdcard/Download",
        }),
      ),
    );
  });
  it("confirms permanent Android deletion and can cancel without changing files", async () => {
    await browser();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Celular: notas.txt" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Celular: ${t("fileDelete")}` }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(t("fileDeletePhone"))).toBeInTheDocument();
    expect(api.startFileJob).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: t("cancel") }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.startFileJob).not.toHaveBeenCalled();
  });
  it("creates and renames inside the current folder with structured arguments", async () => {
    await browser();
    fireEvent.click(
      screen.getByRole("button", { name: `Celular: ${t("fileNewFolder")}` }),
    );
    fireEvent.change(screen.getByLabelText(t("fileNewName")), {
      target: { value: "Nueva Ñ" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t("save"),
      }),
    );
    await waitFor(() =>
      expect(api.editFile).toHaveBeenCalledWith(
        "p",
        "phone",
        "/sdcard/Download",
        "Nueva Ñ",
        null,
        null,
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Celular: notas.txt" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Celular: ${t("fileRename")}` }),
    );
    fireEvent.change(screen.getByLabelText(t("fileNewName")), {
      target: { value: "nuevo.txt" },
    });
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: t("save"),
      }),
    );
    await waitFor(() =>
      expect(api.editFile).toHaveBeenLastCalledWith(
        "p",
        "phone",
        "/sdcard/Download",
        "nuevo.txt",
        "/sdcard/Download/notas.txt",
        null,
      ),
    );
  });
  it("routes native Windows drops to the phone folder under the pointer", async () => {
    const { container } = await browser();
    const row = screen.getByRole("button", { name: "Fotos Ñ" }).closest("tr")!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(row);
    await waitFor(() => expect(native.drop).not.toBeNull());
    await act(async () =>
      native.drop!({
        payload: {
          type: "drop",
          paths: ["C:\\Pictures\\a.jpg"],
          position: { x: 200, y: 100 },
        },
      }),
    );
    expect(api.startFileJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSide: "local",
        targetSide: "phone",
        targetDirectory: "/sdcard/Download/Fotos Ñ",
        paths: ["C:\\Pictures\\a.jpg"],
      }),
    );
    expect(container.querySelectorAll("[data-file-side]")).toHaveLength(2);
  });
  it("drags between panes without relying on HTML5 file access", async () => {
    vi.stubGlobal("PointerEvent", MouseEvent);
    const { container } = await browser();
    const source = screen.getByRole("button", { name: "app.apk" });
    const phone = container.querySelector('[data-file-side="phone"]')!;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(phone);
    fireEvent.pointerDown(source, {
      button: 0,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, { clientX: 300, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 300, clientY: 20, pointerId: 1 });
    await waitFor(() =>
      expect(api.startFileJob).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "copy",
          sourceSide: "local",
          targetSide: "phone",
        }),
      ),
    );
    vi.unstubAllGlobals();
  });
  it("preselects keep both instead of replacing an existing file", async () => {
    const job: FileJob = {
      id: "j",
      profileId: "p",
      operation: "copy",
      state: "conflict",
      bytesDone: 0,
      bytesTotal: 5,
      filesDone: 0,
      filesTotal: 1,
      current: "a.txt",
      skipped: 0,
      created: 1,
      error: null,
      conflict: {
        source: "C:\\a.txt",
        target: "/sdcard/Download/a.txt",
        kind: "file",
      },
    };
    render(
      <FileJobs
        jobs={[job]}
        profiles={snapshot.settings.profiles}
        t={t}
        onError={vi.fn()}
        onOpen={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: t("fileKeepBoth") }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: t("fileResolve") }));
    await waitFor(() =>
      expect(api.resolveFileConflict).toHaveBeenCalledWith("j", "keep", false),
    );
  });
});
