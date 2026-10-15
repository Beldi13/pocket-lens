import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OptionsEditor, RegisterDialog } from "./components";
import { translator } from "./i18n";
import { applyPreset, defaultOptions, profileMatches } from "./types";
import type { AppSnapshot, DetectedDevice, DeviceProfile } from "./types";
import { api } from "./api";

vi.mock("./api", () => ({
  desktop: true,
  api: {
    discover: vi.fn(),
    register: vi.fn(),
    pair: vi.fn(),
    connect: vi.fn(),
    prepare: vi.fn(),
  },
}));
const t = translator("es");
const phone: DetectedDevice = {
  serial: "TEST-USB",
  state: "device",
  transport: "usb",
  model: "Test Android",
  manufacturer: "Test",
  androidVersion: "13",
  sdk: 33,
  identity: "TEST-STABLE-ID",
};
function snapshot(devices: DetectedDevice[] = [phone]): AppSnapshot {
  return {
    settings: {
      version: 1,
      profiles: [],
      preferences: {
        language: "es",
        theme: "system",
        autostartInitialized: true,
      },
    },
    discovery: { devices, services: [], warning: null },
    sessions: [],
    devices: [],
    autostart: true,
    engineVersion: "4.1",
  };
}
function wizard(data = snapshot()) {
  return render(
    <RegisterDialog
      snapshot={data}
      t={t}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
}
describe("registration wizard", () => {
  it("does not allow an unauthorized device to be saved", () => {
    wizard(snapshot([{ ...phone, state: "unauthorized" }]));
    expect(screen.getByRole("button", { name: /Test Android/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDisabled();
    expect(screen.getByText(t("unauthorized"))).toBeInTheDocument();
    expect(api.register).not.toHaveBeenCalled();
  });
  it("saves the explicitly selected device and custom preferences", async () => {
    const onSaved = vi.fn();
    vi.mocked(api.register).mockResolvedValue({} as DeviceProfile);
    render(
      <RegisterDialog
        snapshot={snapshot()}
        t={t}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Test Android/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    const name = screen.getByLabelText(t("name"));
    name.focus();
    fireEvent.change(name, { target: { value: "My tablet" } });
    expect(name).toHaveFocus();
    fireEvent.click(
      screen.getByRole("switch", { name: new RegExp(t("turnScreenOff")) }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Guardar dispositivo/ }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(api.register).toHaveBeenCalledWith(
      phone.serial,
      "My tablet",
      expect.objectContaining({ turnScreenOff: true, maxSize: 1920 }),
      null,
    );
  });
  it("explains expired pairing codes and clears the secret", async () => {
    vi.mocked(api.pair).mockRejectedValue({
      code: "pair_failed",
      message: "Pairing failed",
    });
    wizard(snapshot([]));
    fireEvent.click(screen.getByRole("button", { name: t("wifi") }));
    fireEvent.change(screen.getByLabelText(t("pairAddress")), {
      target: { value: "192.168.1.20:37123" },
    });
    fireEvent.change(screen.getByLabelText(t("code")), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: t("pair") }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Genera un código nuevo/,
    );
    expect(screen.getByLabelText(t("code"))).toHaveValue("");
  });
  it("shows a recoverable manual connection error when discovery is unavailable", async () => {
    vi.mocked(api.connect).mockRejectedValue({
      code: "connection",
      message: "Connection refused",
    });
    wizard(snapshot([]));
    fireEvent.click(screen.getByRole("button", { name: t("wifi") }));
    fireEvent.change(screen.getByLabelText(t("connectAddress")), {
      target: { value: "192.168.1.20:5555" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: t("connect") }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Comprueba la red/,
    );
    expect(screen.getByRole("button", { name: /Continuar/ })).toBeDisabled();
  });
  it("requires explicit confirmation when Android has no stable identity", () => {
    render(
      <RegisterDialog
        snapshot={snapshot()}
        t={t}
        initialDevice={{ ...phone, identity: null }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Guardar dispositivo/ }),
    ).toBeDisabled();
    fireEvent.click(screen.getByLabelText(t("identityConfirm")));
    expect(
      screen.getByRole("button", { name: /Guardar dispositivo/ }),
    ).toBeEnabled();
  });
});
describe("profile settings", () => {
  it("changes quality without dropping the recording directory", () => {
    const original = {
      ...defaultOptions,
      recordingDirectory: "C:\\Videos",
      record: true,
    };
    expect(applyPreset(original, "light")).toMatchObject({
      recordingDirectory: "C:\\Videos",
      record: true,
      maxSize: 1280,
      maxFps: 30,
      bitRate: 4,
      codec: "h264",
    });
    expect(original.maxSize).toBe(1920);
  });
  it("disabling control also disables incompatible screen power settings", () => {
    const onChange = vi.fn();
    render(
      <OptionsEditor
        value={{ ...defaultOptions, turnScreenOff: true, stayAwake: true }}
        onChange={onChange}
        t={t}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: t("control") }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        control: false,
        turnScreenOff: false,
        stayAwake: false,
      }),
    );
  });
  it("does not confuse two phones of the same model or IP", () => {
    const profile = {
      identity: phone.identity,
      usbSerials: [],
      endpoints: ["192.168.1.20:5555"],
      model: phone.model,
    } as unknown as DeviceProfile;
    expect(
      profileMatches(profile, {
        ...phone,
        serial: "192.168.1.20:5555",
        identity: "OTHER-ID",
      }),
    ).toBe(false);
    expect(
      profileMatches(profile, { ...phone, serial: "192.168.1.21:40999" }),
    ).toBe(true);
  });
});
