import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Download, RefreshCw } from "lucide-react";
import { api, desktop } from "./api";
import { asError } from "./types";
import type { AppError, UpdateStatus } from "./types";
import type { Translate } from "./i18n";
import { ErrorNotice, Modal } from "./components";
import { fileSize } from "./files";

const initial: UpdateStatus = {
  state: "idle",
  version: null,
  notes: "",
  downloaded: 0,
  total: null,
  error: null,
};
export function useUpdates() {
  const [status, setStatus] = useState(initial);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void api
      .updateStatus()
      .then((s) => {
        if (!disposed) setStatus(s);
      })
      .catch(() => {});
    void listen<UpdateStatus>("updater://changed", (e) => {
      if (!disposed) setStatus(e.payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    const timeout = window.setTimeout(() => {
      void api
        .checkUpdates()
        .then((s) => {
          if (!disposed) setStatus(s);
        })
        .catch(() => {});
    }, 8000);
    return () => {
      disposed = true;
      unlisten?.();
      window.clearTimeout(timeout);
    };
  }, []);
  const check = useCallback(async () => {
    const s = await api.checkUpdates();
    setStatus(s);
  }, []);
  const download = useCallback(async () => {
    const s = await api.downloadUpdate();
    setStatus(s);
  }, []);
  return { status, check, download };
}
export function UpdateBanner({
  status,
  t,
  onOpen,
}: {
  status: UpdateStatus;
  t: Translate;
  onOpen: () => void;
}) {
  if (!["available", "downloaded", "downloading"].includes(status.state))
    return null;
  return (
    <div className="update-banner" role="status">
      <Download size={18} />
      <span>
        {t(
          status.state === "downloaded"
            ? "updateReady"
            : status.state === "downloading"
              ? "updateDownloading"
              : "updateAvailable",
        )}{" "}
        {status.version}
      </span>
      <button className="text-button" onClick={onOpen}>
        {t("updates")}
      </button>
    </div>
  );
}
export function UpdatePanel({
  status,
  check,
  download,
  hasJobs,
  t,
  onError,
}: {
  status: UpdateStatus;
  check: () => Promise<void>;
  download: () => Promise<void>;
  hasJobs: boolean;
  t: Translate;
  onError: (e: AppError) => void;
}) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<AppError | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(asError(e));
    } finally {
      setBusy(false);
    }
  };
  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.installUpdate(hasJobs);
    } catch (e) {
      const error = asError(e);
      setError(error);
      onError(error);
      setConfirm(false);
      setBusy(false);
    }
  };
  const progressing = ["checking", "downloading", "installing"].includes(
    status.state,
  );
  const message =
    status.state === "checking"
      ? "updateChecking"
      : status.state === "current"
        ? "updateCurrent"
        : status.state === "noStable"
          ? "updateNoStable"
          : status.state === "downloading"
            ? "updateDownloading"
            : status.state === "downloaded"
              ? "updateReady"
              : status.state === "installing"
                ? "updateInstalling"
                : status.state === "available"
                  ? "updateAvailable"
                  : null;
  return (
    <section className="settings-panel update-panel">
      <h2>{t("updates")}</h2>
      <p>{t("updatesHint")}</p>
      {message && (
        <p role="status">
          {t(message)} {status.version}
        </p>
      )}
      {(error ?? status.error) && (
        <ErrorNotice error={(error ?? status.error)!} t={t} />
      )}
      {status.state === "downloading" && (
        <>
          <progress
            value={status.downloaded}
            max={Math.max(status.total ?? 0, status.downloaded, 1)}
          />
          <small>
            {fileSize(status.downloaded)}
            {status.total ? ` / ${fileSize(status.total)}` : ""}
          </small>
        </>
      )}
      {status.notes && (
        <details className="update-notes">
          <summary>{t("updateNotes")}</summary>
          <pre>{status.notes}</pre>
        </details>
      )}
      <div className="update-actions">
        <button
          className="secondary"
          disabled={!desktop || busy || progressing}
          onClick={() => void run(check)}
        >
          <RefreshCw size={16} />
          {t("updateCheck")}
        </button>
        {status.state === "available" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void run(download)}
          >
            <Download size={16} />
            {t("updateDownload")}
          </button>
        )}
        {status.state === "downloaded" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            {t("updateInstall")}
          </button>
        )}
      </div>
      {confirm && (
        <Modal
          title={t("updateInstallTitle")}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <div className="wizard-body">
            <p>{t("updateInstallHint")}</p>
            {hasJobs && <p className="warning-text">{t("updateJobsHint")}</p>}
          </div>
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {t("updateWait")}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void install()}
            >
              {t(hasJobs ? "updateCancelJobs" : "updateConfirm")}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
