import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UpdatePanel, useUpdates } from "./updates";
import { translator } from "./i18n";
import { api } from "./api";
import type { UpdateStatus } from "./types";
vi.mock("./api", () => ({
  desktop: true,
  api: {
    updateStatus: vi.fn(),
    checkUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
const t = translator("es");
const ready: UpdateStatus = {
  state: "downloaded",
  version: "0.3.1",
  notes: "Changes",
  downloaded: 10,
  total: 10,
  error: null,
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("confirmed stable updates", () => {
  it("requires an explicit download action", () => {
    const download = vi.fn(async () => {});
    render(
      <UpdatePanel
        status={{ ...ready, state: "available" }}
        check={vi.fn()}
        download={download}
        hasJobs={false}
        t={t}
        onError={vi.fn()}
      />,
    );
    expect(download).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: t("updateDownload") }));
    expect(download).toHaveBeenCalledOnce();
  });
  it("confirms active jobs and session closure before installation", async () => {
    vi.mocked(api.installUpdate).mockResolvedValue();
    render(
      <UpdatePanel
        status={ready}
        check={vi.fn()}
        download={vi.fn()}
        hasJobs
        t={t}
        onError={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: t("updateInstall") }));
    expect(screen.getByText(t("updateJobsHint"))).toBeInTheDocument();
    expect(api.installUpdate).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: t("updateCancelJobs") }),
      ),
    );
    expect(api.installUpdate).toHaveBeenCalledWith(true);
  });
  it("checks once at startup without downloading and tolerates offline errors", async () => {
    vi.useFakeTimers();
    vi.mocked(api.updateStatus).mockResolvedValue({ ...ready, state: "idle" });
    vi.mocked(api.checkUpdates).mockRejectedValue({
      code: "update_network",
      message: "offline",
    });
    function Harness() {
      const { status } = useUpdates();
      return <div>{status.state}</div>;
    }
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(api.checkUpdates).toHaveBeenCalledOnce();
    expect(api.downloadUpdate).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
  });
});
