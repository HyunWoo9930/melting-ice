import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const assetVersion = "20260516-canvas-1";
const meltFrameCount = 256;
const meltFrameDigits = 3;
const meltFrameExtension = "webp";
const frameCanvasSize = 720;
const backgroundPreloadConcurrency = 6;
const heaterSpeed = 1.3;
const refreezeSpeed = 1.15;
const freezerHoldMs = 10 * 60 * 1000;
const freezerWarningMs = 5 * 1000;
const defaultMinutes = 25;
const defaultTitle = "이 얼음이 녹기 전에";
const doneTitle = `수고했어요 · ${defaultTitle}`;

const modes = {
  normal: "normal",
  heater: "heater",
  freezer: "freezer",
} as const;

type TimerMode = (typeof modes)[keyof typeof modes];
type FreezerPhase = "off" | "holding" | "warning" | "refreezing";
type TimerState = "idle" | "running" | "done";

const meltFrames = Array.from(
  { length: meltFrameCount },
  (_, index) =>
    `/assets/frames/ice-${String(index).padStart(meltFrameDigits, "0")}.${meltFrameExtension}?v=${assetVersion}`,
);
const baseIceFrame = meltFrames[0];

const meltFrameImages: Array<HTMLImageElement | undefined> =
  Array(meltFrameCount);
const meltFramePromises: Array<Promise<HTMLImageElement | null> | undefined> =
  Array(meltFrameCount);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function visualProgress(melt: number) {
  return melt * melt * (3 - 2 * melt);
}

function loadMeltFrame(index: number) {
  if (index < 0 || index >= meltFrames.length) return Promise.resolve(null);
  if (meltFramePromises[index]) return meltFramePromises[index]!;

  const image = new Image();
  image.decoding = "async";

  meltFramePromises[index] = new Promise((resolve) => {
    image.onload = () => {
      meltFrameImages[index] = image;
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = meltFrames[index];
  });

  return meltFramePromises[index]!;
}

function loadBaseIceFrame() {
  return loadMeltFrame(0);
}

function nearestLoadedFrame(index: number) {
  if (meltFrameImages[index]) return index;

  for (let distance = 1; distance < meltFrames.length; distance += 1) {
    const previous = index - distance;
    const next = index + distance;

    if (previous >= 0 && meltFrameImages[previous]) return previous;
    if (next < meltFrames.length && meltFrameImages[next]) return next;
  }

  return -1;
}

function freezerPhase(
  mode: TimerMode,
  modeStartedAt: number,
  now = Date.now(),
): FreezerPhase {
  if (mode !== modes.freezer) return "off";
  const elapsedMs = now - modeStartedAt;
  if (elapsedMs >= freezerHoldMs) return "refreezing";
  if (elapsedMs >= freezerHoldMs - freezerWarningMs) return "warning";
  return "holding";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIdRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const durationSecondsRef = useRef(defaultMinutes * 60);
  const remainingMsRef = useRef(defaultMinutes * 60 * 1000);
  const modeStartedAtRef = useRef(0);
  const modeRef = useRef<TimerMode>(modes.normal);
  const isRunningRef = useRef(false);
  const lastDynamicMeltRef = useRef(-1);

  const [durationMinutes, setDurationMinutes] = useState(defaultMinutes);
  const [remainingMs, setRemainingMs] = useState(remainingMsRef.current);
  const [isRunning, setIsRunning] = useState(false);
  const [activeMode, setActiveMode] = useState<TimerMode>(modes.normal);
  const [modeStartedAt, setModeStartedAt] = useState(0);
  const [isRippling, setIsRippling] = useState(false);

  const totalMs = durationSecondsRef.current * 1000;
  const progress = totalMs <= 0 ? 0 : clamp(1 - remainingMs / totalMs, 0, 1);
  const visualMelt = visualProgress(progress);
  const currentFreezerPhase = freezerPhase(activeMode, modeStartedAt);
  const timerState: TimerState =
    remainingMs === 0 ? "done" : isRunning ? "running" : "idle";
  const isDone = timerState === "done";

  const startPauseText = useMemo(() => {
    if (isDone) return "완료";
    if (isRunning) return "멈춤";
    return remainingMs === totalMs ? "시작" : "계속";
  }, [isDone, isRunning, remainingMs, totalMs]);

  const drawDynamicMelt = useCallback((melt: number) => {
    const image = meltFrameImages[0];
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!image || !context) return;

    const nextMelt = clamp(melt, 0, 1);
    if (Math.abs(nextMelt - lastDynamicMeltRef.current) < 0.001) return;

    const size = frameCanvasSize;
    const waterOpacity = 0.08 + nextMelt * 0.62;
    const puddleWidth = size * (0.24 + nextMelt * 0.56);
    const puddleHeight = size * (0.045 + nextMelt * 0.105);
    const bottom = size * (0.985 - nextMelt * 0.62);
    const topInset = size * nextMelt * 0.035;
    const sideInset = size * nextMelt * 0.11;
    const wave = size * (0.006 + nextMelt * 0.032);

    context.clearRect(0, 0, size, size);

    context.save();
    context.globalAlpha = waterOpacity;
    context.fillStyle = "#8DCFF4";
    context.beginPath();
    context.ellipse(
      size / 2,
      size * 0.78,
      puddleWidth / 2,
      puddleHeight / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();

    context.save();
    context.beginPath();
    context.moveTo(sideInset, topInset);
    context.lineTo(size - sideInset, topInset);
    context.lineTo(size - sideInset * 0.82, bottom - wave * 0.35);

    const segments = 8;
    for (let index = segments; index >= 0; index -= 1) {
      const x = sideInset + ((size - sideInset * 2) * index) / segments;
      const y = bottom + Math.sin(index * 1.35 + nextMelt * 7.2) * wave;
      context.lineTo(x, y);
    }

    context.closePath();
    context.clip();
    context.globalAlpha = 1 - nextMelt * 0.08;
    context.drawImage(image, 0, 0, size, size);
    context.restore();

    if (nextMelt > 0.12) {
      context.save();
      context.globalAlpha = nextMelt * 0.34;
      context.fillStyle = "#B9E1F9";
      for (let index = 0; index < 5; index += 1) {
        const x = size * (0.33 + index * 0.085);
        const y = bottom + size * (0.025 + (index % 2) * 0.025);
        const radius = size * (0.008 + nextMelt * 0.014);
        context.beginPath();
        context.ellipse(x, y, radius * 0.8, radius * 1.4, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }

    lastDynamicMeltRef.current = nextMelt;
  }, []);

  const requestMeltFrameWindow = useCallback((index: number) => {
    [
      index,
      index + 1,
      index + 2,
      index + 3,
      index + 6,
      index - 1,
      index - 2,
    ].forEach((nearbyIndex) => {
      void loadMeltFrame(nearbyIndex);
    });
  }, []);

  const updateMeltFrame = useCallback(
    (melt: number) => {
      if (meltFrameImages[0]) {
        drawDynamicMelt(melt);
        return;
      }

      void loadBaseIceFrame().then(() => drawDynamicMelt(melt));
    },
    [drawDynamicMelt],
  );

  const syncView = useCallback(() => {
    const nextRemainingMs = clamp(
      remainingMsRef.current,
      0,
      durationSecondsRef.current * 1000,
    );
    remainingMsRef.current = nextRemainingMs;
    setRemainingMs(nextRemainingMs);
    setIsRunning(isRunningRef.current);
    setActiveMode(modeRef.current);
    setModeStartedAt(modeStartedAtRef.current);
    updateMeltFrame(
      visualProgress(
        durationSecondsRef.current <= 0
          ? 0
          : 1 - nextRemainingMs / (durationSecondsRef.current * 1000),
      ),
    );
  }, [updateMeltFrame]);

  const stopLoop = useCallback(() => {
    if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    frameIdRef.current = 0;
  }, []);

  const applyElapsed = useCallback((now: number) => {
    if (!lastTickTimeRef.current) {
      lastTickTimeRef.current = now;
      return;
    }

    const previousTickTime = lastTickTimeRef.current;
    const elapsedMs = Math.max(0, now - previousTickTime);
    lastTickTimeRef.current = now;

    if (modeRef.current === modes.heater) {
      remainingMsRef.current -= elapsedMs * heaterSpeed;
      return;
    }

    if (modeRef.current === modes.freezer) {
      const previousRefreezeMs = Math.max(
        0,
        previousTickTime - modeStartedAtRef.current - freezerHoldMs,
      );
      const currentRefreezeMs = Math.max(
        0,
        now - modeStartedAtRef.current - freezerHoldMs,
      );
      const refreezeMs = currentRefreezeMs - previousRefreezeMs;
      remainingMsRef.current += refreezeMs * refreezeSpeed;
      remainingMsRef.current = Math.min(
        remainingMsRef.current,
        durationSecondsRef.current * 1000,
      );
      return;
    }

    remainingMsRef.current -= elapsedMs;
  }, []);

  const tick = useCallback(() => {
    applyElapsed(Date.now());
    remainingMsRef.current = clamp(
      remainingMsRef.current,
      0,
      durationSecondsRef.current * 1000,
    );
    syncView();

    if (remainingMsRef.current <= 0) {
      isRunningRef.current = false;
      modeRef.current = modes.normal;
      modeStartedAtRef.current = 0;
      stopLoop();
      syncView();
      return;
    }

    frameIdRef.current = requestAnimationFrame(tick);
  }, [applyElapsed, stopLoop, syncView]);

  const start = useCallback(() => {
    if (remainingMsRef.current <= 0) return;
    isRunningRef.current = true;
    lastTickTimeRef.current = Date.now();
    stopLoop();
    tick();
  }, [stopLoop, tick]);

  const pause = useCallback(() => {
    isRunningRef.current = false;
    lastTickTimeRef.current = 0;
    stopLoop();
    syncView();
  }, [stopLoop, syncView]);

  const reset = useCallback(() => {
    isRunningRef.current = false;
    modeRef.current = modes.normal;
    modeStartedAtRef.current = 0;
    lastTickTimeRef.current = 0;
    remainingMsRef.current = durationSecondsRef.current * 1000;
    stopLoop();
    syncView();
  }, [stopLoop, syncView]);

  const setDuration = useCallback(
    (minutes: number) => {
      const safeMinutes = clamp(Number(minutes) || defaultMinutes, 1, 180);
      durationSecondsRef.current = safeMinutes * 60;
      setDurationMinutes(safeMinutes);
      reset();
    },
    [reset],
  );

  const toggleMode = useCallback(
    (mode: TimerMode) => {
      if (!isRunningRef.current || remainingMsRef.current <= 0) return;

      applyElapsed(Date.now());
      modeRef.current = modeRef.current === mode ? modes.normal : mode;
      modeStartedAtRef.current = Date.now();
      syncView();
    },
    [applyElapsed, syncView],
  );

  useEffect(() => {
    document.title = isDone ? doneTitle : defaultTitle;
  }, [isDone]);

  useEffect(() => {
    void loadBaseIceFrame().then(() => drawDynamicMelt(0));
  }, [drawDynamicMelt]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!isRunningRef.current || document.visibilityState !== "visible")
        return;
      stopLoop();
      tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [stopLoop, tick]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

    const registerServiceWorker = () => {
      void navigator.serviceWorker
        .register("/service-worker.js")
        .catch(() => {});
    };

    if (document.readyState === "loading") {
      window.addEventListener("load", registerServiceWorker, { once: true });
      return () => window.removeEventListener("load", registerServiceWorker);
    }

    registerServiceWorker();
  }, []);

  useEffect(() => () => stopLoop(), [stopLoop]);

  return (
    <main
      className="app"
      data-state={timerState}
      data-mode={activeMode}
      data-freezer-phase={currentFreezerPhase}
      style={
        { "--melt": visualMelt.toFixed(4) } as CSSProperties &
          Record<"--melt", string>
      }
    >
      <header className="topbar" aria-label="서비스 헤더">
        <a className="brand" href="./" aria-label="이 얼음이 녹기 전에 홈">
          이 얼음이 녹기 전에
        </a>
        <button
          className="icon-button"
          type="button"
          aria-label="전체 화면"
          onClick={async () => {
            if (!document.fullscreenElement) {
              await document.documentElement.requestFullscreen?.();
              return;
            }
            await document.exitFullscreen?.();
          }}
        >
          <span aria-hidden="true">⛶</span>
        </button>
      </header>

      <section className="timer-shell" aria-label="얼음 공부 타이머">
        <div className="mode-controls" aria-label="온도 조절">
          <div className="mode-buttons">
            <button
              className={`mode-action mode-action-heater${activeMode === modes.heater ? " active" : ""}`}
              type="button"
              aria-label={
                activeMode === modes.heater ? "히터 끄기" : "히터 켜기"
              }
              aria-pressed={activeMode === modes.heater}
              onClick={() => toggleMode(modes.heater)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 22c3.9 0 7-2.9 7-6.7 0-2.4-1.3-4.5-3.4-6.7-.8 2.3-2.2 3.7-3.6 4.4.6-3.2-.8-6.1-3.4-8.7C8.2 7.5 5 10 5 15.3 5 19.1 8.1 22 12 22Z" />
              </svg>
            </button>
            <button
              className={`mode-action mode-action-freezer${activeMode === modes.freezer ? " active" : ""}`}
              type="button"
              aria-label={
                activeMode === modes.freezer ? "냉장고 끄기" : "냉장고 켜기"
              }
              aria-pressed={activeMode === modes.freezer}
              onClick={() => toggleMode(modes.freezer)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 2v20" />
                <path d="M4.9 4.9 19.1 19.1" />
                <path d="M19.1 4.9 4.9 19.1" />
                <path d="m8 4 4 4 4-4" />
                <path d="m8 20 4-4 4 4" />
                <path d="m4 8 4 4-4 4" />
                <path d="m20 8-4 4 4 4" />
              </svg>
            </button>
          </div>
          <p
            className="freezer-warning"
            role="status"
            aria-live="assertive"
            data-visible={currentFreezerPhase === "warning"}
          >
            위험! 곧 얼음이 다시 얼어요.
          </p>
        </div>

        <button
          className={`ice-stage${isRippling ? " ripple" : ""}`}
          type="button"
          aria-label="얼음을 누르면 작은 물결이 생깁니다"
          onClick={() => {
            setIsRippling(false);
            window.requestAnimationFrame(() => setIsRippling(true));
          }}
          onAnimationEnd={() => setIsRippling(false)}
        >
          <span className="melt-scene" aria-hidden="true">
            <canvas
              ref={canvasRef}
              className="melt-frame"
              width={frameCanvasSize}
              height={frameCanvasSize}
            />
          </span>
        </button>

        <div className="duration-panel" aria-label="시간 설정">
          <label className="custom-time">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={durationMinutes}
              aria-label="공부 시간(분)"
              onChange={(event) =>
                setDuration(event.currentTarget.valueAsNumber)
              }
            />
            <span>분</span>
          </label>
        </div>

        <div className="actions">
          <button
            className="primary-action"
            type="button"
            disabled={isDone}
            onClick={() => {
              if (isRunningRef.current) {
                pause();
                return;
              }
              start();
            }}
          >
            {startPauseText}
          </button>
          <button
            className="secondary-action icon-action"
            type="button"
            aria-label="다시 시작"
            onClick={reset}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
        </div>
        <p
          className="completion-status"
          role="status"
          aria-live="polite"
          data-visible={isDone}
        >
          {isDone ? "수고했어요." : ""}
        </p>
      </section>
    </main>
  );
}
