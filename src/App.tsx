import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  Command,
  ExternalLink,
  LayoutGrid,
  LoaderCircle,
  Monitor,
  MonitorOff,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Power,
  Radio,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Usb,
  Wifi,
  X,
} from "lucide-react";
import { api, desktop } from "./api";
import { version } from "../package.json";
import { FileBrowser, FileJobs, activeJob } from "./files";
import { UpdateBanner, UpdatePanel, useUpdates } from "./updates";
import { PhoneArtwork } from "./artwork";
import {
  EditDialog,
  ErrorNotice,
  Modal,
  RegisterDialog,
  Toggle,
} from "./components";
import { errorText, translator } from "./i18n";
import type { Key, Language } from "./i18n";
import { asError, profileMatches } from "./types";
import type {
  AppError,
  AppSnapshot,
  DetectedDevice,
  DeviceProfile,
  SessionStatus,
  FileJob,
} from "./types";

const emptySnapshot: AppSnapshot = {
  settings: {
    version: 1,
    profiles: [],
    preferences: { language: "", theme: "system", autostartInitialized: false },
  },
  discovery: { devices: [], services: [], warning: null },
  devices: [],
  sessions: [],
  autostart: false,
  engineVersion: "4.1",
};
export default function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [language, setLanguage] = useState<Language>(
    navigator.language.startsWith("es") ? "es" : "en",
  );
  const [theme, setTheme] = useState("system");
  const [view, setView] = useState<"devices" | "settings" | "help" | "files">(
    "devices",
  );
  const [fileProfile, setFileProfile] = useState("");
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [quitConfirm, setQuitConfirm] = useState(false);
  const updates = useUpdates();
  const [register, setRegister] = useState(false),
    [initialDevice, setInitialDevice] = useState<DetectedDevice>();
  const [editing, setEditing] = useState<DeviceProfile | null>(null),
    [forgetting, setForgetting] = useState<DeviceProfile | null>(null);
  const [identityProfile, setIdentityProfile] = useState<DeviceProfile | null>(
      null,
    ),
    [identitySerial, setIdentitySerial] = useState("");
  const [diagnostics, setDiagnostics] = useState<{
    name: string;
    log: string;
  } | null>(null);
  const [error, setError] = useState<AppError | null>(null),
    [toast, setToast] = useState("");
  const [busy, setBusy] = useState<string[]>([]),
    [scanning, setScanning] = useState(false);
  const t = translator(language);
  const refresh = useCallback(async () => {
    if (!desktop) return;
    const next = await api.snapshot();
    setSnapshot(next);
    if (
      next.settings.preferences.language === "en" ||
      next.settings.preferences.language === "es"
    )
      setLanguage(next.settings.preferences.language);
    setTheme(next.settings.preferences.theme || "system");
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
  }, [language, theme]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const sync = () => {
      if (!disposed) void refresh().catch((e) => setError(asError(e)));
    };
    sync();
    void Promise.all([
      listen("devices://changed", sync),
      listen("session://changed", sync),
      listen("profiles://changed", sync),
      listen<AppError>("engine://error", (event) => {
        if (!disposed) setError(event.payload);
      }),
    ])
      .then((results) => {
        if (disposed) results.forEach((fn) => fn());
        else unlisteners.push(...results);
      })
      .catch((e) => {
        if (!disposed) setError(asError(e));
      });
    const interval = window.setInterval(sync, 5000);
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
      window.clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const sync = () => {
      void api
        .fileJobs()
        .then((next) => {
          if (!disposed) setJobs(next);
        })
        .catch((e) => {
          if (!disposed) setError(asError(e));
        });
    };
    sync();
    void Promise.all([
      listen("transfer://changed", sync),
      listen("exit://requested", () => setQuitConfirm(true)),
    ]).then((results) => {
      if (disposed) results.forEach((fn) => fn());
      else unlisteners.push(...results);
    });
    const timer = window.setInterval(sync, 2500);
    return () => {
      disposed = true;
      unlisteners.forEach((fn) => fn());
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  const perform = async (
    id: string,
    action: () => Promise<unknown>,
    success?: string,
  ) => {
    setBusy((previous) => [...previous, id]);
    setError(null);
    try {
      await action();
      await refresh();
      if (success) setToast(success);
    } catch (e) {
      setError(asError(e));
    } finally {
      setBusy((previous) => previous.filter((value) => value !== id));
    }
  };
  const open = (
    profile: DeviceProfile,
    confirmedSerial: string | null = null,
  ) => {
    void perform(profile.id, async () => {
      try {
        await api.open(profile.id, confirmedSerial);
        setIdentityProfile(null);
      } catch (e) {
        const issue = asError(e);
        if (issue.code === "identity_confirmation") {
          setIdentityProfile(profile);
          setIdentitySerial("");
        } else throw e;
      }
    });
  };
  const scan = () => {
    setScanning(true);
    void perform("scan", api.discover).finally(() => setScanning(false));
  };
  const saved = (message: string) => {
    setRegister(false);
    setEditing(null);
    setInitialDevice(undefined);
    setToast(message);
    void refresh().catch((e) => setError(asError(e)));
  };
  const startRegister = (device?: DetectedDevice) => {
    setInitialDevice(device);
    setRegister(true);
  };
  const preferences = (
    nextLanguage: Language,
    nextTheme: string,
    autostart: boolean,
  ) => {
    setLanguage(nextLanguage);
    setTheme(nextTheme);
    void perform("preferences", () =>
      api.preferences(nextLanguage, nextTheme, autostart),
    );
  };
  const sessions = snapshot.sessions;
  const active = sessions.filter((s) =>
    ["starting", "running", "stopping"].includes(s.state),
  ).length;
  const available = snapshot.devices.filter(
    (d) => d.state === "available",
  ).length;
  const nearby = snapshot.discovery.devices.filter(
    (d) => !snapshot.settings.profiles.some((p) => profileMatches(p, d)),
  );
  const statusLabel = (state: string) =>
    t(
      (
        {
          available: "availableOne",
          disconnected: "disconnected",
          unauthorized: "unauthorized",
          offline: "offline",
          starting: "starting",
          running: "running",
          stopping: "stopping",
          closed: "closed",
          error: "error",
        } as Record<string, Key>
      )[state] ?? "disconnected",
    );
  const deviceCard = (profile: DeviceProfile, index: number) => {
    const device = snapshot.devices.find((d) => d.profileId === profile.id);
    const session = sessions.find((s) => s.profileId === profile.id);
    const isActive =
      !!session && ["starting", "running", "stopping"].includes(session.state);
    const state = isActive
      ? session.state
      : session?.state === "error"
        ? "error"
        : (device?.state ?? "disconnected");
    return (
      <article className={`device-card color-${index % 3}`} key={profile.id}>
        <div className="card-top">
          <span className={`status status-${state}`}>
            <i />
            {statusLabel(state)}
          </span>
          <details className="card-menu">
            <summary aria-label={t("configure")}>
              <MoreHorizontal size={20} />
            </summary>
            <div>
              <button onClick={() => setEditing(profile)}>
                <Settings2 size={15} />
                {t("configure")}
              </button>
              <button
                onClick={() =>
                  void perform("diagnostics", async () =>
                    setDiagnostics({
                      name: profile.name,
                      log: await api.diagnostics(profile.id),
                    }),
                  )
                }
              >
                <BookOpen size={15} />
                {t("diagnostics")}
              </button>
              <button
                disabled={
                  isActive ||
                  busy.includes(profile.id) ||
                  jobs.some((j) => j.profileId === profile.id && activeJob(j))
                }
                className="danger-text"
                onClick={() => setForgetting(profile)}
              >
                <X size={15} />
                {t("forget")}
              </button>
            </div>
          </details>
        </div>
        <div className="device-art" aria-hidden="true">
          <PhoneArtwork name={profile.name} image={profile.artwork} />
          <span className="connection-bubble">
            {device?.transport === "usb" ? (
              <Usb size={18} />
            ) : (
              <Wifi size={18} />
            )}
          </span>
        </div>
        <h3>{profile.name}</h3>
        <p className="device-model">
          {profile.model || "Android"}
          {profile.androidVersion ? ` · Android ${profile.androidVersion}` : ""}
        </p>
        <div className="device-prefs">
          <span>{profile.options.maxFps} FPS</span>
          <span>{profile.options.codec.toUpperCase().replace("H", "H.")}</span>
          {profile.options.turnScreenOff && (
            <span>
              <Monitor size={12} />
            </span>
          )}
          {profile.options.record && (
            <span className="record-tag">
              <Radio size={12} /> MP4
            </span>
          )}
        </div>
        {session?.error && (
          <p className="card-error" role="alert">
            {errorText(session.error.code, t)}
          </p>
        )}
        <div className="card-actions">
          <button
            className={isActive ? "secondary" : "primary"}
            disabled={
              busy.includes(profile.id) ||
              state === "starting" ||
              state === "stopping" ||
              !desktop
            }
            onClick={() =>
              isActive
                ? void perform(profile.id, () => api.close(profile.id))
                : open(profile)
            }
          >
            {busy.includes(profile.id) ||
            state === "starting" ||
            state === "stopping" ? (
              <LoaderCircle size={16} className="spin" />
            ) : isActive ? (
              <X size={16} />
            ) : (
              <Monitor size={16} />
            )}{" "}
            {isActive
              ? t("close")
              : device?.state === "available"
                ? t("open")
                : t("reconnect")}
          </button>
          <button
            className="icon-button configure-button"
            aria-label={`${t("configure")} ${profile.name}`}
            onClick={() => setEditing(profile)}
          >
            <Settings2 size={18} />
          </button>
        </div>
        <div className="card-file-actions">
          <button
            className="secondary"
            disabled={!desktop}
            onClick={() => {
              setFileProfile(profile.id);
              setView("files");
            }}
          >
            <FolderOpen size={15} />
            {t("files")}
          </button>
          {isActive && (
            <div className="card-screen-actions">
              <button
                className="secondary"
                title={t("screenOnHint")}
                disabled={
                  state !== "running" ||
                  !profile.options.control ||
                  busy.includes(`screen:${profile.id}`)
                }
                onClick={() =>
                  void perform(
                    `screen:${profile.id}`,
                    () => api.screenPower(profile.id, true),
                    t("screenSent"),
                  )
                }
              >
                <Monitor size={14} />
                {t("screenOn")}
              </button>
              <button
                className="secondary"
                title={t("screenOffHint")}
                disabled={
                  state !== "running" ||
                  !profile.options.control ||
                  busy.includes(`screen:${profile.id}`)
                }
                onClick={() =>
                  void perform(
                    `screen:${profile.id}`,
                    () => api.screenPower(profile.id, false),
                    t("screenSent"),
                  )
                }
              >
                <MonitorOff size={14} />
                {t("screenOff")}
              </button>
            </div>
          )}
        </div>
        {session?.recordingPath && (
          <details className="recording-path">
            <summary>{t("recordingSaved")}</summary>
            <p>{session.recordingPath}</p>
          </details>
        )}
      </article>
    );
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setView("devices");
          }}
        >
          <img src="/pocket-lens.svg" width="42" height="42" alt="" />
          <span>
            Pocket Lens<small>{t("tagline")}</small>
          </span>
        </a>
        <div className="sidebar-label">{t("workspace")}</div>
        <nav aria-label={t("workspace")}>
          {(
            [
              { key: "devices", icon: LayoutGrid },
              { key: "files", icon: FolderOpen },
              { key: "settings", icon: Settings2 },
              { key: "help", icon: CircleHelp },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              className={view === item.key ? "selected" : ""}
              disabled={
                item.key === "files" && !snapshot.settings.profiles.length
              }
              onClick={() => {
                if (item.key === "files" && !fileProfile)
                  setFileProfile(snapshot.settings.profiles[0]?.id ?? "");
                setView(item.key);
              }}
            >
              <item.icon size={19} />
              <span>{t(item.key)}</span>
              {item.key === "devices" && (
                <b>{snapshot.settings.profiles.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <ShieldCheck size={19} />
            <span>{t("local")}</span>
          </div>
          <p>
            {t("powered")} <span>4.1</span>
          </p>
          <small>Pocket Lens · v{version}</small>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            <span className="breadcrumb-dot" /> {t(view)}
          </span>
          <div>
            <span className="android-label">
              <Smartphone size={14} /> Android
            </span>
            <button
              className="language-button"
              onClick={() =>
                preferences(
                  language === "es" ? "en" : "es",
                  theme,
                  snapshot.autostart,
                )
              }
              disabled={!desktop || busy.includes("preferences")}
            >
              {language.toUpperCase()}
            </button>
          </div>
        </header>
        <div className="page-content">
          {!desktop && (
            <div className="notice warning browser-banner">
              {t("browserOnly")}
            </div>
          )}
          {error && (
            <ErrorNotice error={error} t={t} onDismiss={() => setError(null)} />
          )}
          {view !== "settings" && (
            <UpdateBanner
              status={updates.status}
              t={t}
              onOpen={() => setView("settings")}
            />
          )}
          {view === "files" && fileProfile && (
            <>
              <FileBrowser
                key={fileProfile}
                profileId={fileProfile}
                snapshot={snapshot}
                t={t}
                onProfileChange={setFileProfile}
                onBack={() => setView("devices")}
              />
              <FileJobs
                jobs={jobs}
                profiles={snapshot.settings.profiles}
                t={t}
                onError={setError}
                onOpen={setFileProfile}
              />
            </>
          )}
          {view === "devices" && (
            <>
              <section
                className={`hero ${snapshot.settings.profiles.length ? "hero-compact" : ""}`}
              >
                <div>
                  <span className="eyebrow">
                    <span />
                    {t("eyebrow")}
                  </span>
                  <h1>
                    {snapshot.settings.profiles.length ? (
                      t("devices")
                    ) : (
                      <>
                        {t("title")}
                        <br />
                        <em>{t("titleAccent")}</em>
                      </>
                    )}
                  </h1>
                  <p>{t("subtitle")}</p>
                  <button
                    className="primary"
                    onClick={() => startRegister()}
                    disabled={!desktop}
                  >
                    <Plus size={18} />
                    {t("add")}
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="hero-desktop">
                    <div className="desktop-camera" />
                    <div className="desktop-screen">
                      <div className="mini-window">
                        <i />
                        <span />
                        <span />
                        <b />
                      </div>
                      <div className="mini-lines">
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                    <div className="desktop-stand" />
                  </div>
                  <div className="hero-phone">
                    <div className="phone-island" />
                    <div className="hero-phone-inner">
                      <Sparkles size={31} />
                    </div>
                  </div>
                  <span className="float-badge">
                    <Check size={18} />
                  </span>
                  <span className="float-wifi">
                    <Wifi size={24} />
                  </span>
                </div>
              </section>
              <section className="stats-row">
                <div>
                  <span className="stat-icon mint">
                    <Smartphone size={19} />
                  </span>
                  <strong>{snapshot.settings.profiles.length}</strong>
                  <span>{t("saved")}</span>
                </div>
                <div>
                  <span className="stat-icon blue">
                    <Wifi size={19} />
                  </span>
                  <strong>{available}</strong>
                  <span>{t("available")}</span>
                </div>
                <div>
                  <span className="stat-icon peach">
                    <Monitor size={19} />
                  </span>
                  <strong>{active}</strong>
                  <span>{t("active")}</span>
                </div>
              </section>
              <section className="library-section">
                <div className="section-heading">
                  <div>
                    <h2>{t("library")}</h2>
                    <p>{t("libraryDesc")}</p>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={t("refresh")}
                    onClick={scan}
                    disabled={scanning || !desktop}
                  >
                    <RefreshCw size={18} className={scanning ? "spin" : ""} />
                  </button>
                </div>
                {snapshot.settings.profiles.length ? (
                  <div className="device-grid">
                    {snapshot.settings.profiles.map(deviceCard)}
                  </div>
                ) : (
                  <div className="empty-library">
                    <div className="empty-symbol">
                      <Smartphone size={32} />
                      <span>
                        <Plus size={13} />
                      </span>
                    </div>
                    <h3>{t("emptyTitle")}</h3>
                    <p>{t("emptyDesc")}</p>
                    <button
                      className="text-button"
                      disabled={!desktop}
                      onClick={() => startRegister()}
                    >
                      {t("add")}
                      <ArrowRight size={16} />
                    </button>
                    <div className="benefits">
                      <span>
                        <Usb size={14} />
                        {t("usbOrWifi")}
                      </span>
                      <span>
                        <LayoutGrid size={14} />
                        {t("multiple")}
                      </span>
                      <span>
                        <ShieldCheck size={14} />
                        {t("noAccount")}
                      </span>
                    </div>
                  </div>
                )}
              </section>
              <section className="nearby-panel">
                <div className="section-heading">
                  <div>
                    <h3>
                      <Radio size={16} />
                      {t("nearby")}
                    </h3>
                    <p>{t("nearbyDesc")}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={scan}
                    disabled={!desktop || scanning}
                  >
                    <RefreshCw size={14} className={scanning ? "spin" : ""} />
                    {scanning ? t("searching") : t("refresh")}
                  </button>
                </div>
                {nearby.length ? (
                  nearby.map((d) => (
                    <div className="nearby-device" key={d.serial}>
                      <span className="nearby-icon">
                        {d.transport === "usb" ? (
                          <Usb size={20} />
                        ) : (
                          <Wifi size={20} />
                        )}
                      </span>
                      <div>
                        <strong>{d.model || d.serial}</strong>
                        <small>
                          {d.state === "device"
                            ? d.serial
                            : statusLabel(d.state)}
                        </small>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => startRegister(d)}
                      >
                        {t("add")}
                        <Plus size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="nearby-empty">{t("noNearby")}</p>
                )}
                {snapshot.discovery.warning && (
                  <p className="warning-text">{t("mdnsWarning")}</p>
                )}
              </section>
            </>
          )}
          {view === "settings" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">POCKET LENS</span>
                <h1>{t("preferencesTitle")}</h1>
                <p>{t("preferencesSubtitle")}</p>
              </div>
              <section className="settings-panel">
                <label className="setting-select">
                  <span>{t("language")}</span>
                  <select
                    disabled={!desktop || busy.includes("preferences")}
                    value={language}
                    onChange={(e) =>
                      preferences(
                        e.target.value as Language,
                        theme,
                        snapshot.autostart,
                      )
                    }
                  >
                    <option value="es">Español</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="setting-select">
                  <span>{t("theme")}</span>
                  <select
                    value={theme}
                    onChange={(e) =>
                      preferences(language, e.target.value, snapshot.autostart)
                    }
                    disabled={!desktop || busy.includes("preferences")}
                  >
                    <option value="system">{t("system")}</option>
                    <option value="light">{t("lightTheme")}</option>
                    <option value="dark">{t("dark")}</option>
                  </select>
                </label>
                <Toggle
                  label={t("startup")}
                  hint={t("startupHint")}
                  checked={snapshot.autostart}
                  disabled={!desktop || busy.includes("preferences")}
                  onChange={(value) => preferences(language, theme, value)}
                />
                <p className="guide-note">{t("trayHint")}</p>
                <button
                  className="secondary"
                  disabled={!desktop}
                  onClick={() => {
                    if (jobs.some(activeJob)) setQuitConfirm(true);
                    else void perform("exit", () => api.exit());
                  }}
                >
                  <Power size={17} />
                  {t("quit")}
                </button>
              </section>
              <UpdatePanel
                status={updates.status}
                check={updates.check}
                download={updates.download}
                hasJobs={jobs.some(activeJob)}
                t={t}
                onError={setError}
              />
              <section className="privacy-panel">
                <ShieldCheck size={28} />
                <div>
                  <h3>{t("privacy")}</h3>
                  <p>{t("privacyText")}</p>
                  <a
                    href="https://github.com/Beldi13/pocket-lens"
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => {
                      if (desktop) {
                        event.preventDefault();
                        void perform("source", api.source);
                      }
                    }}
                  >
                    {t("source")}
                    <ExternalLink size={14} />
                  </a>
                </div>
              </section>
            </>
          )}
          {view === "help" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">POCKET LENS</span>
                <h1>{t("guideTitle")}</h1>
                <p>{t("guideSubtitle")}</p>
              </div>
              <div className="guide-cards">
                {(
                  [
                    ["guide1", "guide1Desc", Usb],
                    ["guide2", "guide2Desc", Settings2],
                    ["guide3", "guide3Desc", Monitor],
                  ] as const
                ).map(([title, description, Icon], i) => (
                  <section key={title}>
                    <span className="guide-number">0{i + 1}</span>
                    <Icon size={25} />
                    <h3>{t(title)}</h3>
                    <p>{t(description)}</p>
                  </section>
                ))}
              </div>
              <section className="settings-panel">
                <h3>{t("troubleshooting")}</h3>
                <p>{t("troubleshootingText")}</p>
                <p>{t("screenHelp")}</p>
                <button
                  className="primary"
                  disabled={!desktop}
                  onClick={() => startRegister()}
                >
                  <Plus size={17} />
                  {t("add")}
                </button>
              </section>
              <section className="privacy-panel">
                <ShieldCheck size={28} />
                <div>
                  <h3>{t("privacy")}</h3>
                  <p>{t("privacyText")}</p>
                </div>
              </section>
            </>
          )}
          <footer>
            <span>
              <Command size={13} /> Pocket Lens
            </span>
            <span>Open source. On your side.</span>
          </footer>
        </div>
      </main>
      {register && (
        <RegisterDialog
          snapshot={snapshot}
          t={t}
          initialDevice={initialDevice}
          onClose={() => setRegister(false)}
          onSaved={() => saved(t("registeredMessage"))}
        />
      )}
      {view !== "files" && jobs.some(activeJob) && (
        <div className="file-jobs-banner">
          <FolderOpen size={17} />
          <span>
            {jobs.filter(activeJob).length} · {t("fileQueue")}
          </span>
          <button
            className="text-button"
            onClick={() => {
              setFileProfile(jobs.find(activeJob)!.profileId);
              setView("files");
            }}
          >
            {t("fileShowJobs")}
          </button>
        </div>
      )}
      {quitConfirm && (
        <Modal title={t("exitJobsTitle")} onClose={() => setQuitConfirm(false)}>
          <div className="wizard-body">
            <p>{t("exitJobsHint")}</p>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setQuitConfirm(false)}>
              {t("cancel")}
            </button>
            <button
              className="primary"
              disabled={busy.includes("exit")}
              onClick={() => void perform("exit", () => api.exit(true))}
            >
              {t("exitJobsConfirm")}
            </button>
          </div>
        </Modal>
      )}
      {editing && (
        <EditDialog
          key={editing.id}
          profile={
            snapshot.settings.profiles.find((p) => p.id === editing.id) ??
            editing
          }
          t={t}
          onClose={() => setEditing(null)}
          onSaved={() => saved(t("savedMessage"))}
        />
      )}
      {forgetting && (
        <Modal
          title={t("forgetQuestion")}
          subtitle={t("forgetDetail")}
          onClose={() => setForgetting(null)}
        >
          <p className="confirm-name">{forgetting.name}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setForgetting(null)}>
              {t("cancel")}
            </button>
            <button
              className="danger"
              disabled={busy.includes("forget")}
              onClick={() =>
                void perform("forget", async () => {
                  await api.forget(forgetting.id);
                  setForgetting(null);
                })
              }
            >
              {t("forget")}
            </button>
          </div>
        </Modal>
      )}
      {identityProfile && (
        <Modal
          title={t("identityTitle")}
          subtitle={t("identityDetail")}
          onClose={() => setIdentityProfile(null)}
        >
          <div className="wizard-body">
            <label className="field">
              <span>{t("chooseDevice")}</span>
              <select
                value={identitySerial}
                onChange={(e) => setIdentitySerial(e.target.value)}
              >
                <option value="">{t("chooseDevice")}</option>
                {snapshot.discovery.devices
                  .filter(
                    (d) =>
                      d.state === "device" &&
                      (!identityProfile.identity ||
                        !d.identity ||
                        d.identity === identityProfile.identity),
                  )
                  .map((d) => (
                    <option key={d.serial} value={d.serial}>
                      {d.model} · {d.serial}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button
              className="secondary"
              onClick={() => setIdentityProfile(null)}
            >
              {t("cancel")}
            </button>
            <button
              className="primary"
              disabled={!identitySerial || busy.includes(identityProfile.id)}
              onClick={() => open(identityProfile, identitySerial)}
            >
              {t("confirm")}
            </button>
          </div>
        </Modal>
      )}
      {diagnostics && (
        <Modal
          wide
          title={t("diagnostics")}
          subtitle={diagnostics.name}
          onClose={() => setDiagnostics(null)}
        >
          <pre className="diagnostic-log">{diagnostics.log || "—"}</pre>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

export function sessionIsActive(session?: SessionStatus) {
  return (
    !!session && ["starting", "running", "stopping"].includes(session.state)
  );
}
