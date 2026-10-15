import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as chooseFolder } from "@tauri-apps/plugin-dialog";
import {
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Monitor,
  Pencil,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { api, desktop } from "./api";
import { ErrorNotice, Modal } from "./components";
import { asError } from "./types";
import type {
  AppError,
  AppSnapshot,
  DirectoryListing,
  FileJob,
  FileRequest,
  FileSide,
} from "./types";
import type { Key, Translate } from "./i18n";

export const activeJob = (job: FileJob) =>
  !["completed", "cancelled", "error"].includes(job.state);
export function fileSize(size: number) {
  if (size < 1024) return `${size} B`;
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), 4);
  return `${(size / 1024 ** index).toFixed(1)} ${["B", "KB", "MB", "GB", "TB"][index]}`;
}
type PaneState = {
  listing: DirectoryListing;
  draft: string;
  selected: string[];
  filter: string;
  sort: string;
  reverse: boolean;
  loading: boolean;
  error: AppError | null;
  history: string[];
  historyIndex: number;
};
const emptyPane = (): PaneState => ({
  listing: { path: "", parent: null, entries: [] },
  draft: "",
  selected: [],
  filter: "",
  sort: "name",
  reverse: false,
  loading: false,
  error: null,
  history: [],
  historyIndex: -1,
});
type Action = {
  type: "mkdir" | "rename" | "delete" | "move";
  side: FileSide;
  paths: string[];
  name: string;
};

export function FileBrowser({
  profileId,
  snapshot,
  onProfileChange,
  onBack,
  t,
}: {
  profileId: string;
  snapshot: AppSnapshot;
  onProfileChange: (id: string) => void;
  onBack: () => void;
  t: Translate;
}) {
  const [panes, setPanes] = useState<Record<FileSide, PaneState>>({
    local: emptyPane(),
    phone: emptyPane(),
  });
  const [action, setAction] = useState<Action | null>(null),
    [actionBusy, setActionBusy] = useState(false),
    [actionError, setActionError] = useState<AppError | null>(null);
  const [confirmedSerial, setConfirmedSerial] = useState<string | null>(null),
    [serialChoice, setSerialChoice] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    side: FileSide;
    x: number;
    y: number;
  } | null>(null);
  const [dragPoint, setDragPoint] = useState<{
    x: number;
    y: number;
    count: number;
  } | null>(null);
  const drag = useRef<{
      side: FileSide;
      paths: string[];
      x: number;
      y: number;
      moved: boolean;
      element: Element;
      pointerId: number;
    } | null>(null),
    ignoreClick = useRef(false);
  const pointerHandlers = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  const generation = useRef({ local: 0, phone: 0 });
  const state = useRef(panes);
  useLayoutEffect(() => {
    state.current = panes;
  }, [panes]);
  const update = (side: FileSide, change: Partial<PaneState>) =>
    setPanes((p) => ({ ...p, [side]: { ...p[side], ...change } }));
  const load = useCallback(
    async (
      side: FileSide,
      path: string,
      historyIndex?: number,
      initial = false,
    ) => {
      const sequence = ++generation.current[side];
      setPanes((p) => ({
        ...p,
        [side]: { ...p[side], draft: path, loading: true, error: null },
      }));
      try {
        let listing: DirectoryListing;
        try {
          listing = await api.listFiles(profileId, side, path, confirmedSerial);
        } catch (e) {
          const error = asError(e);
          if (
            !initial ||
            [
              "identity_confirmation",
              "identity_mismatch",
              "unauthorized",
              "not_found",
              "connection",
            ].includes(error.code)
          )
            throw e;
          listing = await api.listFiles(
            profileId,
            side,
            side === "phone" ? "/sdcard" : "",
            confirmedSerial,
          );
        }
        if (generation.current[side] !== sequence) return;
        setPanes((p) => {
          const previous = p[side];
          const history =
            historyIndex !== undefined
              ? previous.history
              : previous.history[previous.historyIndex] === listing.path
                ? previous.history
                : [
                    ...previous.history.slice(0, previous.historyIndex + 1),
                    listing.path,
                  ];
          return {
            ...p,
            [side]: {
              ...previous,
              listing,
              draft: listing.path,
              loading: false,
              selected: previous.selected.filter((v) =>
                listing.entries.some((e) => e.path === v),
              ),
              history,
              historyIndex: historyIndex ?? history.length - 1,
            },
          };
        });
      } catch (e) {
        if (generation.current[side] === sequence)
          setPanes((p) => ({
            ...p,
            [side]: { ...p[side], loading: false, error: asError(e) },
          }));
      }
    },
    [profileId, confirmedSerial],
  );
  useEffect(() => {
    let disposed = false;
    const sequences = generation.current;
    if (desktop)
      void api
        .fileDefaults(profileId)
        .then(([local, phone]) => {
          if (!disposed) {
            void load("local", local, undefined, true);
            void load("phone", phone, undefined, true);
          }
        })
        .catch((e) => {
          if (!disposed) setError(asError(e));
        });
    return () => {
      disposed = true;
      sequences.local++;
      sequences.phone++;
    };
  }, [profileId, load]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("files://changed", (event) => {
      if (event.payload === profileId && !disposed)
        for (const side of ["local", "phone"] as const) {
          const pane = state.current[side];
          if (pane.historyIndex >= 0)
            void load(side, pane.listing.path, pane.historyIndex);
        }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [profileId, load]);
  const enqueue = useCallback(
    async (
      operation: FileRequest["operation"],
      sourceSide: FileSide,
      paths: string[],
      targetSide: FileSide,
      targetDirectory?: string,
    ) => {
      setError(null);
      try {
        await api.startFileJob({
          profileId,
          operation,
          sourceSide,
          paths,
          targetSide,
          targetDirectory:
            targetDirectory ?? state.current[targetSide].listing.path,
          confirmedSerial,
        });
      } catch (e) {
        setError(asError(e));
      }
    },
    [profileId, confirmedSerial],
  );
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (disposed || event.payload.type !== "drop") return;
        const { x, y } = event.payload.position;
        const hit = document.elementFromPoint(
          x / window.devicePixelRatio,
          y / window.devicePixelRatio,
        );
        const pane = hit?.closest<HTMLElement>("[data-file-side]");
        if (
          pane?.dataset.fileSide !== "phone" ||
          state.current.phone.historyIndex < 0
        )
          return;
        const folder =
          hit?.closest<HTMLElement>("[data-folder-path]")?.dataset.folderPath;
        void enqueue("copy", "local", event.payload.paths, "phone", folder);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => {
        if (!disposed) setError(asError(e));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [enqueue]);
  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (!(e.target as Element)?.closest(".file-context"))
        setContextMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        drag.current = null;
        setDragPoint(null);
      }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const beginAction = (type: Action["type"], side: FileSide) => {
    const pane = state.current[side];
    const paths = pane.selected;
    setContextMenu(null);
    setActionError(null);
    setAction({
      type,
      side,
      paths,
      name:
        type === "rename"
          ? (pane.listing.entries.find((e) => e.path === paths[0])?.name ?? "")
          : "",
    });
  };
  const submitAction = async () => {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.type === "delete" || action.type === "move") {
        await api.startFileJob({
          profileId,
          operation: action.type,
          sourceSide: action.side,
          paths: action.paths,
          targetSide:
            action.type === "delete"
              ? action.side
              : action.side === "local"
                ? "phone"
                : "local",
          targetDirectory:
            state.current[action.side === "local" ? "phone" : "local"].listing
              .path,
          confirmedSerial,
        });
      } else {
        await api.editFile(
          profileId,
          action.side,
          state.current[action.side].listing.path,
          action.name,
          action.type === "rename" ? action.paths[0] : null,
          confirmedSerial,
        );
        await load(
          action.side,
          state.current[action.side].listing.path,
          state.current[action.side].historyIndex,
        );
      }
      setAction(null);
    } catch (e) {
      setActionError(asError(e));
    } finally {
      setActionBusy(false);
    }
  };
  const copySelected = (side: FileSide) => {
    setContextMenu(null);
    void enqueue(
      "copy",
      side,
      state.current[side].selected,
      side === "local" ? "phone" : "local",
    );
  };
  const pointerMove = (event: PointerEvent) => {
    const current = drag.current;
    if (!current) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 6) {
      if (!current.moved) {
        try {
          current.element.setPointerCapture?.(current.pointerId);
        } catch {
          /* Window listeners still receive the in-app drop. */
        }
      }
      current.moved = true;
      setDragPoint({
        x: event.clientX,
        y: event.clientY,
        count: current.paths.length,
      });
      event.preventDefault();
    }
  };
  const pointerUp = (event: PointerEvent) => {
    const current = drag.current;
    drag.current = null;
    setDragPoint(null);
    if (!current?.moved) return;
    ignoreClick.current = true;
    window.setTimeout(() => {
      ignoreClick.current = false;
    }, 0);
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const pane = hit?.closest<HTMLElement>("[data-file-side]");
    const targetSide = pane?.dataset.fileSide as FileSide | undefined;
    if (
      targetSide &&
      targetSide !== current.side &&
      state.current[targetSide].historyIndex >= 0
    )
      void enqueue(
        "copy",
        current.side,
        current.paths,
        targetSide,
        hit?.closest<HTMLElement>("[data-folder-path]")?.dataset.folderPath,
      );
  };
  useLayoutEffect(() => {
    pointerHandlers.current = { move: pointerMove, up: pointerUp };
  });
  useEffect(() => {
    const move = (event: PointerEvent) => pointerHandlers.current?.move(event);
    const up = (event: PointerEvent) => pointerHandlers.current?.up(event);
    const cancel = () => {
      drag.current = null;
      setDragPoint(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, []);
  const renderPane = (side: FileSide) => {
    const pane = panes[side];
    const opposite = side === "local" ? "phone" : "local";
    const entries = pane.listing.entries
      .filter((e) =>
        e.name.toLocaleLowerCase().includes(pane.filter.toLocaleLowerCase()),
      )
      .sort((a, b) => {
        if ((a.kind === "directory") !== (b.kind === "directory"))
          return a.kind === "directory" ? -1 : 1;
        const compare =
          pane.sort === "size"
            ? a.size - b.size
            : pane.sort === "date"
              ? a.modified - b.modified
              : a.name.localeCompare(b.name, undefined, { numeric: true });
        return pane.reverse ? -compare : compare;
      });
    const selectable = entries.filter(
      (e) =>
        ["file", "directory"].includes(e.kind) &&
        (side !== "local" || !!pane.listing.path),
    );
    const label = t(side === "local" ? "localFiles" : "phoneFiles");
    const usable = pane.historyIndex >= 0 && !pane.loading;
    return (
      <section className="file-pane" data-file-side={side} aria-label={label}>
        <div className="file-pane-heading">
          <h2>
            {side === "local" ? (
              <Monitor size={18} />
            ) : (
              <Smartphone size={18} />
            )}{" "}
            {label}
          </h2>
          <span>
            {pane.selected.length} {t("fileSelected")}
          </span>
        </div>
        <div className="file-navigation">
          <button
            className="icon-button"
            aria-label={`${label}: ${t("fileBack")}`}
            disabled={pane.loading || pane.historyIndex <= 0}
            onClick={() =>
              void load(
                side,
                pane.history[pane.historyIndex - 1],
                pane.historyIndex - 1,
              )
            }
          >
            <ArrowLeft size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`${label}: ${t("fileForward")}`}
            disabled={
              pane.loading || pane.historyIndex >= pane.history.length - 1
            }
            onClick={() =>
              void load(
                side,
                pane.history[pane.historyIndex + 1],
                pane.historyIndex + 1,
              )
            }
          >
            <ArrowRight size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`${label}: ${t("fileUp")}`}
            disabled={!usable || pane.listing.parent === null}
            onClick={() =>
              pane.listing.parent !== null &&
              void load(side, pane.listing.parent)
            }
          >
            <ArrowUp size={16} />
          </button>
          <button
            className="text-button"
            disabled={pane.loading}
            onClick={() => void load(side, side === "local" ? "" : "/sdcard")}
          >
            {t(side === "local" ? "localFiles" : "internalStorage")}
          </button>
          <button
            className="icon-button"
            aria-label={`${label}: ${t("refresh")}`}
            disabled={pane.loading}
            onClick={() =>
              void load(
                side,
                pane.historyIndex >= 0
                  ? pane.listing.path
                  : pane.draft || (side === "phone" ? "/sdcard" : ""),
                pane.historyIndex >= 0 ? pane.historyIndex : undefined,
              )
            }
          >
            <RefreshCw size={16} className={pane.loading ? "spin" : ""} />
          </button>
        </div>
        <form
          className="file-path"
          onSubmit={(e) => {
            e.preventDefault();
            void load(side, pane.draft);
          }}
        >
          <input
            aria-label={`${label}: ${t("filePath")}`}
            value={pane.draft}
            placeholder={side === "local" ? "C:\\" : "/sdcard"}
            onChange={(e) => update(side, { draft: e.target.value })}
          />
          <button type="submit" disabled={pane.loading}>
            {t("fileGo")}
          </button>
          {side === "local" && (
            <button
              type="button"
              className="icon-button"
              aria-label={t("fileChooseLocal")}
              onClick={() =>
                void chooseFolder({ directory: true, multiple: false })
                  .then((p) => {
                    if (typeof p === "string") void load(side, p);
                  })
                  .catch((e) => setError(asError(e)))
              }
            >
              <FolderOpen size={16} />
            </button>
          )}
        </form>
        <div className="file-toolbar">
          <button
            title={t("fileCopy")}
            aria-label={`${label}: ${t("fileCopy")}`}
            disabled={!pane.selected.length || panes[opposite].historyIndex < 0}
            onClick={() => copySelected(side)}
          >
            <Copy size={15} />
            {t(side === "local" ? "fileToPhone" : "fileToPc")}
          </button>
          <button
            title={t("fileMove")}
            aria-label={`${label}: ${t("fileMove")}`}
            disabled={!pane.selected.length || panes[opposite].historyIndex < 0}
            onClick={() => beginAction("move", side)}
          >
            <ArrowRight size={15} />
          </button>
          <button
            title={t("fileNewFolder")}
            aria-label={`${label}: ${t("fileNewFolder")}`}
            disabled={!usable || !pane.listing.path}
            onClick={() => beginAction("mkdir", side)}
          >
            <FolderPlus size={15} />
          </button>
          <button
            title={t("fileRename")}
            aria-label={`${label}: ${t("fileRename")}`}
            disabled={!usable || pane.selected.length !== 1}
            onClick={() => beginAction("rename", side)}
          >
            <Pencil size={15} />
          </button>
          <button
            title={t("fileDelete")}
            aria-label={`${label}: ${t("fileDelete")}`}
            disabled={!usable || !pane.selected.length}
            onClick={() => beginAction("delete", side)}
          >
            <Trash2 size={15} />
          </button>
        </div>
        <div className="file-filter">
          <Search size={15} />
          <input
            aria-label={`${label}: ${t("fileFilter")}`}
            placeholder={t("fileFilter")}
            value={pane.filter}
            onChange={(e) => update(side, { filter: e.target.value })}
          />
          <select
            aria-label={`${label}: ${t("fileSort")}`}
            value={pane.sort}
            onChange={(e) => update(side, { sort: e.target.value })}
          >
            <option value="name">{t("fileSortName")}</option>
            <option value="size">{t("fileSortSize")}</option>
            <option value="date">{t("fileSortDate")}</option>
          </select>
          <button
            className="icon-button"
            aria-label={`${label}: ${t("fileSortDirection")}`}
            onClick={() => update(side, { reverse: !pane.reverse })}
          >
            <ArrowDownUp size={15} />
          </button>
        </div>
        {pane.error && <ErrorNotice error={pane.error} t={t} />}
        {pane.loading && (
          <div className="file-loading" role="status">
            <LoaderCircle size={16} className="spin" />
            {t("searching")}
          </div>
        )}
        <div className="file-table-wrap" aria-busy={pane.loading}>
          <table className="file-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label={`${label}: ${t("fileSelectAll")}`}
                    checked={
                      selectable.length > 0 &&
                      selectable.every((e) => pane.selected.includes(e.path))
                    }
                    onChange={(e) =>
                      update(side, {
                        selected: e.target.checked
                          ? selectable.map((e) => e.path)
                          : [],
                      })
                    }
                  />
                </th>
                <th>{t("fileName")}</th>
                <th>{t("fileSize")}</th>
                <th>{t("fileModified")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.path}
                  className={
                    pane.selected.includes(entry.path) ? "selected" : ""
                  }
                  data-folder-path={
                    entry.kind === "directory" ? entry.path : undefined
                  }
                  onClick={(event) => {
                    if (
                      ignoreClick.current ||
                      (event.target as Element).closest(
                        "input,button:not(.file-entry-open)",
                      ) ||
                      !["file", "directory"].includes(entry.kind) ||
                      (side === "local" && !pane.listing.path)
                    )
                      return;
                    update(side, {
                      selected: event.ctrlKey
                        ? pane.selected.includes(entry.path)
                          ? pane.selected.filter((p) => p !== entry.path)
                          : [...pane.selected, entry.path]
                        : [entry.path],
                    });
                  }}
                  onDoubleClick={() => {
                    if (entry.kind === "directory") void load(side, entry.path);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (!selectable.includes(entry)) return;
                    if (!pane.selected.includes(entry.path))
                      update(side, { selected: [entry.path] });
                    setContextMenu({
                      side,
                      x: Math.min(event.clientX, window.innerWidth - 210),
                      y: Math.min(event.clientY, window.innerHeight - 240),
                    });
                  }}
                  onPointerDown={(event) => {
                    if (
                      event.button !== 0 ||
                      (event.target as Element).closest(
                        "input,button:not(.file-entry-open)",
                      ) ||
                      !["file", "directory"].includes(entry.kind) ||
                      (side === "local" && !pane.listing.path)
                    )
                      return;
                    const paths = pane.selected.includes(entry.path)
                      ? pane.selected
                      : [entry.path];
                    drag.current = {
                      side,
                      paths,
                      x: event.clientX,
                      y: event.clientY,
                      moved: false,
                      element: event.currentTarget,
                      pointerId: event.pointerId,
                    };
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${label}: ${entry.name}`}
                      checked={pane.selected.includes(entry.path)}
                      disabled={!selectable.includes(entry)}
                      onChange={(e) =>
                        update(side, {
                          selected: e.target.checked
                            ? [...pane.selected, entry.path]
                            : pane.selected.filter((p) => p !== entry.path),
                        })
                      }
                    />
                  </td>
                  <td>
                    <span className="file-entry-name">
                      {entry.kind === "directory" ? (
                        <Folder size={17} />
                      ) : (
                        <File size={17} />
                      )}
                      <button
                        className="file-entry-open"
                        title={entry.path}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (ignoreClick.current) return;
                          if (entry.kind === "directory")
                            void load(side, entry.path);
                          else if (selectable.includes(entry))
                            update(side, { selected: [entry.path] });
                        }}
                      >
                        {entry.name}
                      </button>
                    </span>
                    {!["file", "directory"].includes(entry.kind) && (
                      <small>
                        {t(entry.kind === "link" ? "fileLink" : "fileOther")}
                      </small>
                    )}
                  </td>
                  <td>
                    {entry.kind === "directory" ? "—" : fileSize(entry.size)}
                  </td>
                  <td>
                    {entry.modified
                      ? new Date(entry.modified).toLocaleDateString(
                          document.documentElement.lang || undefined,
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pane.loading && !entries.length && (
            <p className="file-empty">
              {t(pane.filter ? "fileNoMatches" : "fileEmpty")}
            </p>
          )}
        </div>
        <p className="file-drop-hint">
          {side === "phone" ? t("fileDropHint") : t("fileLocalOnly")}
        </p>
      </section>
    );
  };
  return (
    <div className="file-workspace">
      <div className="section-heading">
        <div>
          <h1>{t("files")}</h1>
          <p>{t("filesDesc")}</p>
        </div>
        <button className="secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          {t("fileClose")}
        </button>
      </div>
      <label className="file-device-select">
        {t("fileDevice")}
        <select
          value={profileId}
          onChange={(e) => onProfileChange(e.target.value)}
        >
          {snapshot.settings.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <ErrorNotice error={error} t={t} onDismiss={() => setError(null)} />
      )}
      {panes.phone.error?.code === "identity_confirmation" && (
        <section className="notice warning">
          <h3>{t("fileIdentity")}</h3>
          <p>{t("fileIdentityHint")}</p>
          <select
            aria-label={t("chooseDevice")}
            value={serialChoice}
            onChange={(e) => setSerialChoice(e.target.value)}
          >
            <option value="">{t("chooseDevice")}</option>
            {snapshot.discovery.devices
              .filter((d) => d.state === "device")
              .map((d) => (
                <option key={d.serial} value={d.serial}>
                  {d.model} · {d.transport.toUpperCase()}
                </option>
              ))}
          </select>
          <button
            disabled={!serialChoice}
            onClick={() => setConfirmedSerial(serialChoice)}
          >
            {t("fileConfirmDevice")}
          </button>
        </section>
      )}
      <div className="file-panes">
        {renderPane("local")}
        {renderPane("phone")}
      </div>
      {contextMenu && (
        <div
          className="file-context"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            role="menuitem"
            onClick={() => copySelected(contextMenu.side)}
          >
            {t("fileCopy")}
          </button>
          <button
            role="menuitem"
            onClick={() => beginAction("move", contextMenu.side)}
          >
            {t("fileMove")}
          </button>
          <button
            role="menuitem"
            onClick={() => beginAction("mkdir", contextMenu.side)}
          >
            {t("fileNewFolder")}
          </button>
          <button
            role="menuitem"
            disabled={panes[contextMenu.side].selected.length !== 1}
            onClick={() => beginAction("rename", contextMenu.side)}
          >
            {t("fileRename")}
          </button>
          <button
            role="menuitem"
            onClick={() => beginAction("delete", contextMenu.side)}
          >
            {t("fileDelete")}
          </button>
        </div>
      )}
      {dragPoint && (
        <div
          className="file-drag-ghost"
          style={{ left: dragPoint.x + 12, top: dragPoint.y + 12 }}
        >
          <Copy size={16} />
          {dragPoint.count} · {t("fileDropCopy")}
        </div>
      )}
      {action && (
        <Modal
          title={t(
            (
              {
                mkdir: "fileNewFolder",
                rename: "fileRename",
                delete: "fileDeleteTitle",
                move: "fileMoveTitle",
              } as const
            )[action.type],
          )}
          onClose={() => {
            if (!actionBusy) setAction(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitAction();
            }}
          >
            <div className="wizard-body">
              {actionError && <ErrorNotice error={actionError} t={t} />}
              {["mkdir", "rename"].includes(action.type) ? (
                <label className="field">
                  <span>{t("fileNewName")}</span>
                  <input
                    autoFocus
                    required
                    maxLength={255}
                    value={action.name}
                    onChange={(e) =>
                      setAction({ ...action, name: e.target.value })
                    }
                  />
                </label>
              ) : (
                <>
                  <p>
                    {t(
                      action.type === "move"
                        ? "fileMoveHint"
                        : action.side === "phone"
                          ? "fileDeletePhone"
                          : "fileDeleteLocal",
                    )}
                  </p>
                  <ul className="file-confirm-list">
                    {action.paths.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                  {action.type === "move" && (
                    <p>
                      {t("fileDestination")}:{" "}
                      {
                        panes[action.side === "local" ? "phone" : "local"]
                          .listing.path
                      }
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={actionBusy}
                onClick={() => setAction(null)}
              >
                {t("cancel")}
              </button>
              <button
                className={action.type === "delete" ? "danger" : "primary"}
                disabled={
                  actionBusy ||
                  (["mkdir", "rename"].includes(action.type) &&
                    !action.name.trim())
                }
              >
                {actionBusy && <LoaderCircle size={16} className="spin" />}
                {t(
                  action.type === "delete"
                    ? "fileDelete"
                    : action.type === "move"
                      ? "fileMove"
                      : "save",
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export function FileJobs({
  jobs,
  profiles,
  t,
  onError,
  onOpen,
}: {
  jobs: FileJob[];
  profiles: AppSnapshot["settings"]["profiles"];
  t: Translate;
  onError: (error: AppError) => void;
  onOpen: (id: string) => void;
}) {
  const conflict = jobs.find((j) => j.state === "conflict" && j.conflict);
  const recent = jobs.slice(-8).reverse();
  return (
    <section className="file-jobs">
      <div className="section-heading">
        <h2>{t("fileQueue")}</h2>
        <span>{jobs.filter(activeJob).length}</span>
      </div>
      {!jobs.length && <p>{t("fileNoJobs")}</p>}
      {recent.map((job) => (
        <article key={job.id} className={`file-job job-${job.state}`}>
          <div className="file-job-heading">
            <button
              className="text-button"
              onClick={() => onOpen(job.profileId)}
            >
              {profiles.find((p) => p.id === job.profileId)?.name ?? "Android"}
            </button>
            <strong>{t(`job_${job.state}` as Key)}</strong>
            {activeJob(job) && job.state !== "committing" && (
              <button
                className="icon-button"
                aria-label={`${t("cancel")} ${job.id}`}
                onClick={() =>
                  void api
                    .cancelFileJob(job.id)
                    .catch((e) => onError(asError(e)))
                }
              >
                <X size={15} />
              </button>
            )}
          </div>
          <p title={job.current}>{job.current}</p>
          <progress value={job.bytesDone} max={Math.max(job.bytesTotal, 1)} />
          <small>
            {fileSize(job.bytesDone)} / {fileSize(job.bytesTotal)} ·{" "}
            {job.filesDone}/{job.filesTotal}
          </small>
          {job.skipped > 0 && (
            <p>
              {job.skipped} {t("fileSkipped")}
            </p>
          )}
          {job.error && job.state !== "cancelled" && (
            <ErrorNotice error={job.error} t={t} />
          )}
        </article>
      ))}
      {conflict && (
        <ConflictDialog
          key={`${conflict.id}:${conflict.conflict?.target}`}
          job={conflict}
          t={t}
          onError={onError}
        />
      )}
    </section>
  );
}
function ConflictDialog({
  job,
  t,
  onError,
}: {
  job: FileJob;
  t: Translate;
  onError: (error: AppError) => void;
}) {
  const [choice, setChoice] = useState("keep"),
    [all, setAll] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={t("fileConflictTitle")} onClose={() => {}}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void api
            .resolveFileConflict(job.id, choice, all)
            .catch((e) => onError(asError(e)))
            .finally(() => setBusy(false));
        }}
      >
        <div className="wizard-body">
          <p className="file-conflict-path">
            {t("fileSource")}: {job.conflict?.source}
          </p>
          <p className="file-conflict-path">
            {t("fileDestination")}: {job.conflict?.target}
          </p>
          <fieldset className="conflict-choices">
            {[
              ["keep", "fileKeepBoth"],
              ["skip", "fileSkip"],
              ...(job.conflict?.kind === "file"
                ? [["replace", "fileReplace"]]
                : job.conflict?.kind === "directory"
                  ? [["merge", "fileMerge"]]
                  : []),
            ].map(([value, key]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="conflict"
                  value={value}
                  checked={choice === value}
                  onChange={() => setChoice(value)}
                />
                {t(key as Key)}
              </label>
            ))}
          </fieldset>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />
            {t("fileApplyAll")}
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              void api.cancelFileJob(job.id).catch((e) => onError(asError(e)))
            }
          >
            {t("cancel")}
          </button>
          <button className="primary" disabled={busy}>
            {t("fileResolve")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
