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

function prepareVideo(duration = 10) {
  const video = document.querySelector("video.melt-video") as HTMLVideoElement;
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: duration,
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: 1,
  });
  fireEvent.loadedMetadata(video);
  return video;
}

async function advanceFrame(milliseconds: number) {
  await act(async () => {
    now += milliseconds;
    animationFrameCallbacks.shift()?.(now);
    await Promise.resolve();
  });
}

beforeEach(() => {
  animationFrameCallbacks = [];
  now = 1_000;
  document.title = "test title";

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
      within(runningControls).getByRole("button", { name: "처음으로" }),
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

  it("allows clearing the duration field while typing a new value", () => {
    render(<App />);
    const durationInput = screen.getByRole("spinbutton", {
      name: "공부 시간(분)",
    });

    fireEvent.change(durationInput, { target: { value: "" } });
    expect(durationInput).toHaveValue(null);

    fireEvent.change(durationInput, { target: { value: "45" } });
    expect(durationInput).toHaveValue(45);
  });

  it("syncs the melt video position to timer progress", async () => {
    const user = userEvent.setup();
    render(<App />);
    const video = prepareVideo();

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));

    await advanceFrame(30_000);

    expect(video.currentTime).toBeCloseTo(5, 1);
  });

  it("applies heater speed to timer progress", async () => {
    const user = userEvent.setup();
    render(<App />);
    const video = prepareVideo();

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));
    await user.click(screen.getByRole("button", { name: "히터 켜기" }));
    await advanceFrame(30_000);

    expect(video.currentTime).toBeCloseTo(7.15, 1);
  });

  it("holds freezer progress, warns near refreeze, then refreezes at the configured speed", async () => {
    const user = userEvent.setup();
    render(<App />);
    const video = prepareVideo();

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));
    await advanceFrame(30_000);
    const halfMeltTime = video.currentTime;

    await user.click(screen.getByRole("button", { name: "냉장고 켜기" }));
    await advanceFrame(9 * 60 * 1000 + 56_000);
    expect(video.currentTime).toBeCloseTo(halfMeltTime, 1);
    expect(document.querySelector(".app")).toHaveAttribute(
      "data-freezer-phase",
      "warning",
    );

    await advanceFrame(14_000);
    expect(document.querySelector(".app")).toHaveAttribute(
      "data-freezer-phase",
      "refreezing",
    );
    expect(video.currentTime).toBeLessThan(halfMeltTime);
  });

  it("stops and resets mode when freezer fully refreezes the timer", async () => {
    const user = userEvent.setup();
    render(<App />);
    prepareVideo();

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));
    await advanceFrame(30_000);
    await user.click(screen.getByRole("button", { name: "냉장고 켜기" }));
    await advanceFrame(10 * 60 * 1000 + 30_000);

    expect(document.querySelector(".app")).toHaveAttribute("data-state", "idle");
    expect(document.querySelector(".app")).toHaveAttribute("data-mode", "normal");
    expect(screen.getByRole("button", { name: "시작" })).toBeEnabled();
  });

  it("enters a done state and restores document title on unmount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    prepareVideo();

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));
    await advanceFrame(61_000);

    expect(document.querySelector(".app")).toHaveAttribute("data-state", "done");
    expect(screen.getByRole("button", { name: "완료" })).toBeDisabled();
    expect(document.title).toBe("수고했어요 · 이 얼음이 녹기 전에");

    unmount();
    expect(document.title).toBe("이 얼음이 녹기 전에");
  });

  it("uses the iOS fullscreen fallback when the standard API is unavailable", async () => {
    const user = userEvent.setup();
    const webkitRequestFullscreen = vi.fn();
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document.documentElement, "webkitRequestFullscreen", {
      configurable: true,
      value: webkitRequestFullscreen,
    });

    render(<App />);
    await user.click(screen.getByRole("button", { name: "전체 화면" }));

    expect(webkitRequestFullscreen).toHaveBeenCalled();
  });
});
