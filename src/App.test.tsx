import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

let animationFrameCallbacks: FrameRequestCallback[] = [];
let now = 1_000;

beforeEach(() => {
  animationFrameCallbacks = [];
  now = 1_000;

  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrameCallbacks.push(callback);
    return animationFrameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("keeps pause and reset controls reachable while the timer is running", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "시작" }));

    const runningControls = screen.getByLabelText("온도 조절");
    expect(
      within(runningControls).getByRole("button", { name: "멈춤" }),
    ).toBeVisible();
    expect(
      within(runningControls).getByRole("button", { name: "다시 시작" }),
    ).toBeVisible();
  });

  it("uses one prebuilt melt video instead of a per-frame image canvas", () => {
    render(<App />);

    const video = document.querySelector("video.melt-video");
    const canvas = document.querySelector("canvas.melt-frame");

    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video?.getAttribute("src")).toContain("/assets/ice-melt.webm");
    expect(canvas).not.toBeInTheDocument();
  });

  it("allows focus sessions longer than 180 minutes", () => {
    render(<App />);
    const durationInput = screen.getByRole("spinbutton", {
      name: "공부 시간(분)",
    });

    fireEvent.change(durationInput, {
      target: { value: "240" },
    });

    expect(durationInput).toHaveValue(240);
    expect(durationInput).toHaveAttribute("max", "1440");
  });

  it("syncs the melt video position to timer progress", async () => {
    const user = userEvent.setup();
    render(<App />);
    const video = document.querySelector("video.melt-video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 10,
    });
    Object.defineProperty(video, "readyState", {
      configurable: true,
      value: 1,
    });
    fireEvent.loadedMetadata(video);

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));

    await act(async () => {
      now += 30_000;
      animationFrameCallbacks.shift()?.(now);
      await Promise.resolve();
    });

    expect(video.currentTime).toBeCloseTo(5, 1);
  });
});
