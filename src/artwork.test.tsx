import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtworkEditor, PhoneArtwork } from "./artwork";
import { translator } from "./i18n";
import { api } from "./api";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppSnapshot, DeviceProfile } from "./types";

vi.mock("./api", () => ({
  desktop: true,
  api: { updateArtwork: vi.fn(), removeArtwork: vi.fn(), snapshot: vi.fn() },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const t = translator("es");
const originalImage = "data:image/jpeg;base64,original";
const newImage = "data:image/jpeg;base64,new";
const profile = {
  id: "phone-a",
  name: "Pova",
  artwork: originalImage,
} as DeviceProfile;
beforeEach(() => vi.resetAllMocks());

describe("device artwork", () => {
  it("keeps the existing drawing when there is no image or loading fails", () => {
    const { container, rerender } = render(<PhoneArtwork name="Pova" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("P");
    rerender(<PhoneArtwork name="Pova" image={originalImage} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("P");
    rerender(<PhoneArtwork name="Pova" image={newImage} />);
    expect(container.querySelector("img")).toHaveAttribute("src", newImage);
  });
  it("keeps the previous image if Android cannot provide its wallpaper", async () => {
    vi.mocked(api.updateArtwork).mockResolvedValue(false);
    const { container } = render(
      <ArtworkEditor profile={profile} t={t} onBusyChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: t("artworkRefresh") }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      t("artworkUnavailable"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      originalImage,
    );
    expect(api.updateArtwork).toHaveBeenCalledWith(profile.id, null);
  });
  it("does not update the profile when the file picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const busy = vi.fn();
    render(<ArtworkEditor profile={profile} t={t} onBusyChange={busy} />);
    fireEvent.click(screen.getByRole("button", { name: t("artworkChoose") }));
    await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
    expect(api.updateArtwork).not.toHaveBeenCalled();
  });
  it("shows the sanitized local image returned by the backend", async () => {
    vi.mocked(open).mockResolvedValue("C:\\Pictures\\phone.png");
    vi.mocked(api.updateArtwork).mockResolvedValue(true);
    vi.mocked(api.snapshot).mockResolvedValue({
      settings: { profiles: [{ ...profile, artwork: newImage }] },
    } as AppSnapshot);
    const { container } = render(
      <ArtworkEditor profile={profile} t={t} onBusyChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: t("artworkChoose") }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      t("artworkSaved"),
    );
    expect(api.updateArtwork).toHaveBeenCalledWith(
      profile.id,
      "C:\\Pictures\\phone.png",
    );
    expect(container.querySelector("img")).toHaveAttribute("src", newImage);
  });
  it("restores the drawing after removal and keeps it on failure", async () => {
    vi.mocked(api.removeArtwork)
      .mockRejectedValueOnce({ code: "io", message: "Write failed" })
      .mockResolvedValueOnce();
    const { container } = render(
      <ArtworkEditor profile={profile} t={t} onBusyChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: t("artworkRemove") }));
    await screen.findByRole("alert");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      originalImage,
    );
    fireEvent.click(screen.getByRole("button", { name: t("artworkRemove") }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      t("artworkRemoved"),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("button", { name: t("artworkRemove") }),
    ).toBeDisabled();
    expect(api.removeArtwork).toHaveBeenLastCalledWith(profile.id);
  });
});
