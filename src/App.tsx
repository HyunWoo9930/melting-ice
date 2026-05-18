import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const assetVersion = "20260518-video-1";
const meltFrameCount = 256;
const videoFrameRate = 30;
const heaterSpeed = 1.3;
const refreezeSpeed = 1.15;
const freezerHoldMs = 10 * 60 * 1000;
const freezerWarningMs = 5 * 1000;
const defaultMinutes = 25;
const maxDurationMinutes = 24 * 60;
const defaultTitle = "이 얼음이 녹기 전에";
const doneTitle = `수고했어요 · ${defaultTitle}`;

const modes = {
  normal: "normal",
  heater: "heater",
  freezer: "freezer",
} as const;

type TimerMode = (typeof modes)[keyof typeof modes];
type FreezerPhase = "off" | "holding" | "warning" | "refreezing";
type TimerStatus = "idle" | "running" | "done";

type TimerModel = {
  activeMode: TimerMode;
  durationInput: string;
  durationSeconds: number;
  isRunning: boolean;
  modeStartedAt: number;
  remainingMs: number;
};

type TimerAction =
  | { type: "replace"; state: TimerModel }
  | { type: "setDurationInput"; value: string }
  | { type: "commitDurationInput" }
  | { type: "start" }
  | { type: "pause"; now: number; previousTickTime: number }
  | { type: "reset" }
  | {
      type: "toggleMode";
      mode: TimerMode;
      now: number;
      previousTickTime: number;
    }
  | { type: "tick"; now: number; previousTickTime: number };

const meltVideoSource = `/assets/ice-melt.webm?v=${assetVersion}`;
const meltPosterSource = `/assets/frames/ice-000.webp?v=${assetVersion}`;

const initialTimer: TimerModel = {
  activeMode: modes.normal,
  durationInput: String(defaultMinutes),
  durationSeconds: defaultMinutes * 60,
  isRunning: false,
  modeStartedAt: 0,
  remainingMs: defaultMinutes * 60 * 1000,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function visualProgress(melt: number) {
  return melt * melt * (3 - 2 * melt);
}

function timerTotalMs(timer: TimerModel) {
  return timer.durationSeconds * 1000;
}

function timerProgress(timer: TimerModel) {
  const totalMs = timerTotalMs(timer);
  return totalMs <= 0 ? 0 : clamp(1 - timer.remainingMs / totalMs, 0, 1);
}

function timerVisualMelt(timer: TimerModel) {
  return visualProgress(timerProgress(timer));
}

function timerStatus(timer: TimerModel): TimerStatus {
  if (timer.remainingMs === 0) return "done";
  return timer.isRunning ? "running" : "idle";
}

function parseDurationMinutes(value: string) {
  if (value.trim() === "") return null;
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return null;
  return nextValue;
}

function commitDuration(timer: TimerModel, minutes: number) {
  const safeMinutes = clamp(Math.round(minutes), 1, maxDurationMinutes);
  const durationSeconds = safeMinutes * 60;

  return {
    ...timer,
    activeMode: modes.normal,
    durationInput: String(safeMinutes),
    durationSeconds,
    isRunning: false,
    modeStartedAt: 0,
    remainingMs: durationSeconds * 1000,
  };
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

function applyElapsed(
  timer: TimerModel,
  previousTickTime: number,
  now: number,
) {
  if (!timer.isRunning || !previousTickTime) return timer;

  const elapsedMs = Math.max(0, now - previousTickTime);
  if (elapsedMs === 0) return { ...timer };

  const totalMs = timerTotalMs(timer);
  let remainingMs = timer.remainingMs;
  let activeMode: TimerMode = timer.activeMode;
  let modeStartedAt = timer.modeStartedAt;
  let isRunning: boolean = timer.isRunning;

  if (timer.activeMode === modes.heater) {
    remainingMs -= elapsedMs * heaterSpeed;
  } else if (timer.activeMode === modes.freezer) {
    const previousRefreezeMs = Math.max(
      0,
      previousTickTime - timer.modeStartedAt - freezerHoldMs,
    );
    const currentRefreezeMs = Math.max(
      0,
      now - timer.modeStartedAt - freezerHoldMs,
    );
    const refreezeMs = currentRefreezeMs - previousRefreezeMs;

    remainingMs += refreezeMs * refreezeSpeed;
    if (remainingMs >= totalMs && currentRefreezeMs > 0) {
      remainingMs = totalMs;
      activeMode = modes.normal;
      modeStartedAt = 0;
      isRunning = false;
    }
  } else {
    remainingMs -= elapsedMs;
  }

  if (remainingMs <= 0) {
    return {
      ...timer,
      activeMode: modes.normal,
      isRunning: false,
      modeStartedAt: 0,
      remainingMs: 0,
    };
  }

  return {
    ...timer,
    activeMode,
    isRunning,
    modeStartedAt,
    remainingMs: clamp(remainingMs, 0, totalMs),
  };
}

function timerReducer(timer: TimerModel, action: TimerAction): TimerModel {
  switch (action.type) {
    case "replace":
      return action.state;
    case "setDurationInput": {
      const minutes = parseDurationMinutes(action.value);
      if (
        minutes === null ||
        minutes < 1 ||
        minutes > maxDurationMinutes
      ) {
        return {
          ...timer,
          durationInput: action.value,
        };
      }

      return commitDuration(
        {
          ...timer,
          durationInput: action.value,
        },
        minutes,
      );
    }
    case "commitDurationInput": {
      const minutes =
        parseDurationMinutes(timer.durationInput) ?? timer.durationSeconds / 60;
      return commitDuration(timer, minutes);
    }
    case "start":
      if (timer.remainingMs <= 0) return timer;
      return {
        ...timer,
        isRunning: true,
      };
    case "pause": {
      const nextTimer = applyElapsed(
        timer,
        action.previousTickTime,
        action.now,
      );
      return {
        ...nextTimer,
        isRunning: false,
      };
    }
    case "reset":
      return {
        ...timer,
        activeMode: modes.normal,
        isRunning: false,
        modeStartedAt: 0,
        remainingMs: timerTotalMs(timer),
      };
    case "toggleMode": {
      const elapsedTimer = applyElapsed(
        timer,
        action.previousTickTime,
        action.now,
      );
      if (!elapsedTimer.isRunning || elapsedTimer.remainingMs <= 0) {
        return elapsedTimer;
      }

      const nextMode =
        elapsedTimer.activeMode === action.mode ? modes.normal : action.mode;

      return {
        ...elapsedTimer,
        activeMode: nextMode,
        modeStartedAt: nextMode === modes.normal ? 0 : action.now,
      };
    }
    case "tick":
      return applyElapsed(timer, action.previousTickTime, action.now);
    default:
      return timer;
  }
}

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

async function toggleFullscreen() {
  const fullscreenDocument = document as FullscreenDocument;
  const root = document.documentElement as FullscreenElement;
  const isFullscreen =
    Boolean(document.fullscreenElement) ||
    Boolean(fullscreenDocument.webkitFullscreenElement);

  if (!isFullscreen) {
    await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.());
    return;
  }

  await (document.exitFullscreen?.() ??
    fullscreenDocument.webkitExitFullscreen?.());
}

export default function App() {
  const meltVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameIdRef = useRef(0);
  const lastTickTimeRef = useRef(0);
  const pendingVideoMeltRef = useRef(0);
  const lastSyncedVideoFrameRef = useRef(-1);
  const timerRef = useRef(initialTimer);

  const [timer, dispatchBase] = useReducer(timerReducer, initialTimer);
  const [isRippling, setIsRippling] = useState(false);

  const status = timerStatus(timer);
  const isDone = status === "done";
  const totalMs = timerTotalMs(timer);
  const visualMelt = timerVisualMelt(timer);
  const currentFreezerPhase = freezerPhase(
    timer.activeMode,
    timer.modeStartedAt,
  );

  const dispatchTimer = useCallback((action: TimerAction) => {
    const nextTimer = timerReducer(timerRef.current, action);
    timerRef.current = nextTimer;
    dispatchBase({ type: "replace", state: nextTimer });
    return nextTimer;
  }, []);

  const stopLoop = useCallback(() => {
    if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current);
    frameIdRef.current = 0;
  }, []);

  const syncMeltVideo = useCallback((melt: number, force = false) => {
    const video = meltVideoRef.current;
    const nextMelt = clamp(melt, 0, 1);
    pendingVideoMeltRef.current = nextMelt;
    if (!video) return;

    const targetFrame = Math.round(nextMelt * (meltFrameCount - 1));
    if (!force && targetFrame === lastSyncedVideoFrameRef.current) return;
    if (video.readyState === 0 && targetFrame > 0) return;

    const measuredDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : meltFrameCount / videoFrameRate;
    const maxSeekTime = Math.max(0, measuredDuration - 1 / videoFrameRate);
    const targetTime = (targetFrame / (meltFrameCount - 1)) * maxSeekTime;

    if (Math.abs(video.currentTime - targetTime) > 0.004) {
      video.currentTime = targetTime;
    }

    video.pause();
    lastSyncedVideoFrameRef.current = targetFrame;
  }, []);

  const tick = useCallback(() => {
    const now = Date.now();
    const previousTickTime = lastTickTimeRef.current;
    lastTickTimeRef.current = now;

    const nextTimer = dispatchTimer({
      type: "tick",
      now,
      previousTickTime,
    });

    if (!nextTimer.isRunning) {
      lastTickTimeRef.current = 0;
      stopLoop();
      return;
    }

    frameIdRef.current = requestAnimationFrame(tick);
  }, [dispatchTimer, stopLoop]);

  const start = useCallback(() => {
    const nextTimer = dispatchTimer({ type: "start" });
    if (!nextTimer.isRunning) return;

    lastTickTimeRef.current = Date.now();
    stopLoop();
    frameIdRef.current = requestAnimationFrame(tick);
  }, [dispatchTimer, stopLoop, tick]);

  const pause = useCallback(() => {
    const now = Date.now();
    dispatchTimer({
      type: "pause",
      now,
      previousTickTime: lastTickTimeRef.current,
    });
    lastTickTimeRef.current = 0;
    stopLoop();
  }, [dispatchTimer, stopLoop]);

  const reset = useCallback(() => {
    dispatchTimer({ type: "reset" });
    lastTickTimeRef.current = 0;
    stopLoop();
  }, [dispatchTimer, stopLoop]);

  const toggleMode = useCallback(
    (mode: TimerMode) => {
      const now = Date.now();
      const nextTimer = dispatchTimer({
        type: "toggleMode",
        mode,
        now,
        previousTickTime: lastTickTimeRef.current,
      });

      if (nextTimer.isRunning) {
        lastTickTimeRef.current = now;
      }
    },
    [dispatchTimer],
  );

  const startPauseText = isDone
    ? "완료"
    : timer.isRunning
      ? "멈춤"
      : timer.remainingMs === totalMs
        ? "시작"
        : "계속";

  useEffect(() => {
    timerRef.current = timer;
  }, [timer]);

  useEffect(() => {
    syncMeltVideo(visualMelt);
  }, [syncMeltVideo, visualMelt]);

  useEffect(() => {
    document.title = isDone ? doneTitle : defaultTitle;
    return () => {
      document.title = defaultTitle;
    };
  }, [isDone]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!timerRef.current.isRunning || document.visibilityState !== "visible")
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
      data-state={status}
      data-mode={timer.activeMode}
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
          onClick={() => {
            void toggleFullscreen();
          }}
        >
          <span aria-hidden="true">⛶</span>
        </button>
      </header>

      <section className="timer-shell" aria-label="얼음 공부 타이머">
        <div className="mode-controls" aria-label="온도 조절">
          <div className="mode-buttons">
            <button
              className="mode-action mode-action-control"
              type="button"
              aria-label="멈춤"
              onClick={pause}
            >
              <PauseIcon />
            </button>
            <button
              className="mode-action mode-action-control"
              type="button"
              aria-label="처음으로"
              onClick={reset}
            >
              <ResetIcon />
            </button>
            <button
              className={`mode-action mode-action-heater${timer.activeMode === modes.heater ? " active" : ""}`}
              type="button"
              aria-label={
                timer.activeMode === modes.heater ? "히터 끄기" : "히터 켜기"
              }
              aria-pressed={timer.activeMode === modes.heater}
              onClick={() => toggleMode(modes.heater)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 22c3.9 0 7-2.9 7-6.7 0-2.4-1.3-4.5-3.4-6.7-.8 2.3-2.2 3.7-3.6 4.4.6-3.2-.8-6.1-3.4-8.7C8.2 7.5 5 10 5 15.3 5 19.1 8.1 22 12 22Z" />
              </svg>
            </button>
            <button
              className={`mode-action mode-action-freezer${timer.activeMode === modes.freezer ? " active" : ""}`}
              type="button"
              aria-label={
                timer.activeMode === modes.freezer
                  ? "냉장고 끄기"
                  : "냉장고 켜기"
              }
              aria-pressed={timer.activeMode === modes.freezer}
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
            <video
              ref={meltVideoRef}
              className="melt-video"
              src={meltVideoSource}
              poster={meltPosterSource}
              preload="auto"
              muted
              playsInline
              disablePictureInPicture
              onLoadedMetadata={() =>
                syncMeltVideo(pendingVideoMeltRef.current, true)
              }
              onCanPlay={() =>
                syncMeltVideo(pendingVideoMeltRef.current, true)
              }
            />
          </span>
        </button>

        <div className="duration-panel" aria-label="시간 설정">
          <label className="custom-time">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={maxDurationMinutes}
              value={timer.durationInput}
              aria-label="공부 시간(분)"
              onBlur={() => dispatchTimer({ type: "commitDurationInput" })}
              onChange={(event) =>
                dispatchTimer({
                  type: "setDurationInput",
                  value: event.currentTarget.value,
                })
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
              if (timerRef.current.isRunning) {
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
              <ResetIconPaths />
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

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M8 5v14" />
      <path d="M16 5v14" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <ResetIconPaths />
    </svg>
  );
}

function ResetIconPaths() {
  return (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  );
}
