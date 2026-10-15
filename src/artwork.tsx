import { useState } from "react";
import { ImagePlus, LoaderCircle, RefreshCw, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { api } from "./api";
import { asError } from "./types";
import type { AppError, DeviceProfile } from "./types";
import type { Translate } from "./i18n";
import { ErrorNotice } from "./components";

export function PhoneArtwork({
  name,
  image,
}: {
  name: string;
  image?: string | null;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const visibleImage = image && image !== failedImage ? image : null;
  return (
    <div className="phone-mini" aria-hidden="true">
      <div className="phone-island" />
      <div className={`phone-wallpaper ${visibleImage ? "has-image" : ""}`}>
        {visibleImage ? (
          <img
            src={visibleImage}
            alt=""
            onError={() => setFailedImage(visibleImage)}
          />
        ) : (
          <>
            <span>{name.trim().slice(0, 1).toUpperCase()}</span>
            <i />
            <b />
          </>
        )}
      </div>
      <div className="phone-home" />
    </div>
  );
}

export function ArtworkEditor({
  profile,
  t,
  onBusyChange,
}: {
  profile: DeviceProfile;
  t: Translate;
  onBusyChange: (busy: boolean) => void;
}) {
  const [localImage, setLocalImage] = useState<{
    value: string | null | undefined;
  } | null>(null);
  const image = localImage ? localImage.value : profile.artwork;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<AppError | null>(null);
  const change = async (action: "refresh" | "choose" | "remove") => {
    setBusy(true);
    onBusyChange(true);
    setError(null);
    setMessage("");
    try {
      if (action === "remove") {
        await api.removeArtwork(profile.id);
        setLocalImage({ value: null });
        setMessage(t("artworkRemoved"));
      } else {
        const path =
          action === "choose"
            ? await openDialog({
                multiple: false,
                directory: false,
                filters: [
                  {
                    name: t("artworkTitle"),
                    extensions: ["jpg", "jpeg", "png", "webp"],
                  },
                ],
              })
            : null;
        if (action === "choose" && typeof path !== "string") return;
        const updated = await api.updateArtwork(
          profile.id,
          typeof path === "string" ? path : null,
        );
        if (updated) {
          const next = await api.snapshot();
          setLocalImage({
            value: next.settings.profiles.find((p) => p.id === profile.id)
              ?.artwork,
          });
        }
        setMessage(t(updated ? "artworkSaved" : "artworkUnavailable"));
      }
    } catch (e) {
      setError(asError(e));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <section className="artwork-editor" aria-label={t("artworkTitle")}>
      <div className="artwork-preview">
        <PhoneArtwork name={profile.name} image={image} />
      </div>
      <div>
        <h3>{t("artworkTitle")}</h3>
        <p>{t("artworkHint")}</p>
        <div className="artwork-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void change("refresh")}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            {t("artworkRefresh")}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void change("choose")}
          >
            <ImagePlus size={15} />
            {t("artworkChoose")}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !image}
            onClick={() => void change("remove")}
          >
            <X size={15} />
            {t("artworkRemove")}
          </button>
        </div>
        {message && <p role="status">{message}</p>}
        {error && <ErrorNotice error={error} t={t} />}
      </div>
    </section>
  );
}
