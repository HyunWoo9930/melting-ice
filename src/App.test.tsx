import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

let drawImageSources: string[] = [];
let animationFrameCallbacks: FrameRequestCallback[] = [];
let delayedFrameLoads: Array<() => void> = [];
let delayProgressedFrameLoads = false;
let now = 1_000;

class TestImage {
  decoding = "";
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private imageSrc = "";

  get src() {
    return this.imageSrc;
  }

  set src(value: string) {
    this.imageSrc = value;
    const frameMatch = /ice-(\d{3})\.webp/.exec(value);
    if (
      delayProgressedFrameLoads &&
      frameMatch &&
      frameMatch[1] !== "000"
    ) {
      delayedFrameLoads.push(() => this.onload?.(new Event("load")));
      return;
    }

    queueMicrotask(() => this.onload?.(new Event("load")));
  }
}

function createCanvasContext() {
  return {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn((image: TestImage) => {
      drawImageSources.push(image.src);
    }),
    ellipse: vi.fn(),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    set fillStyle(_value: string) {},
    set globalAlpha(_value: number) {},
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  drawImageSources = [];
  animationFrameCallbacks = [];
  delayedFrameLoads = [];
  delayProgressedFrameLoads = false;
  now = 1_000;

  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("Image", TestImage);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    animationFrameCallbacks.push(callback);
    return animationFrameCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    createCanvasContext(),
  );
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

  it("does not flash back to stale frames while the target melt frame is still loading", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "시작" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    delayProgressedFrameLoads = true;
    drawImageSources = [];

    await act(async () => {
      now += 13 * 60 * 1000;
      animationFrameCallbacks.shift()?.(now);
      await Promise.resolve();
    });

    const drawnFrameIndexes = drawImageSources
      .map((source) => /ice-(\d{3})\.webp/.exec(source)?.[1])
      .filter((frame): frame is string => Boolean(frame))
      .map(Number);

    expect(drawnFrameIndexes.every((frame) => frame >= 130)).toBe(true);

    await act(async () => {
      delayedFrameLoads.splice(0).forEach((resolveLoad) => resolveLoad());
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        drawImageSources.some((source) => /ice-13\d\.webp/.test(source)),
      ).toBe(true);
    });
  });

  it("draws progressed melt frames instead of only redrawing the base frame", async () => {
    const user = userEvent.setup();
    render(<App />);

    fireEvent.change(screen.getByRole("spinbutton", { name: "공부 시간(분)" }), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "시작" }));

    await act(async () => {
      now += 30_000;
      animationFrameCallbacks.shift()?.(now);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        drawImageSources.some((source) => /ice-(?!000)\d{3}\.webp/.test(source)),
      ).toBe(true);
    });
  });
});
