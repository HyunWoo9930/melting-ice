const app = document.querySelector(".app");
const startPauseButton = document.querySelector("#startPauseButton");
const resetButton = document.querySelector("#resetButton");
const fullscreenButton = document.querySelector("#fullscreenButton");
const customMinutes = document.querySelector("#customMinutes");
const heaterButton = document.querySelector("#heaterButton");
const freezerButton = document.querySelector("#freezerButton");
const freezerWarning = document.querySelector("#freezerWarning");
const iceStage = document.querySelector("#iceStage");
const iceCanvas = document.querySelector("#iceCanvas");
const iceContext = iceCanvas.getContext("2d");
const completionStatus = document.querySelector("#completionStatus");
const defaultTitle = document.title;
const doneTitle = `끝났어요 · ${defaultTitle}`;
const assetVersion = "20260516-canvas-1";
const meltFrameCount = 256;
const meltFrameDigits = 3;
const meltFrameExtension = "webp";
const frameCanvasSize = 720;
const backgroundPreloadConcurrency = 6;
const normalMode = "normal";
const heaterMode = "heater";
const freezerMode = "freezer";
const heaterSpeed = 1.3;
const refreezeSpeed = 1.15;
const freezerHoldMs = 10 * 60 * 1000;
const freezerWarningMs = 5 * 1000;
const meltFrames = Array.from(
  { length: meltFrameCount },
  (_, index) =>
    `assets/frames/ice-${String(index).padStart(meltFrameDigits, "0")}.${meltFrameExtension}?v=${assetVersion}`,
);

let durationSeconds = 25 * 60;
let remainingMs = durationSeconds * 1000;
let isRunning = false;
let frameId = 0;
let lastTickTime = 0;
let activeMode = normalMode;
let modeStartedAt = 0;
let currentMeltFrameIndex = -1;
let desiredMeltFrameIndex = 0;
let backgroundPreloadStarted = false;
let nextPreloadIndex = 0;

const meltFrameImages = Array(meltFrameCount);
const meltFramePromises = Array(meltFrameCount);

function loadMeltFrame(index) {
  if (index < 0 || index >= meltFrames.length) return Promise.resolve(null);
  if (meltFramePromises[index]) return meltFramePromises[index];

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

  return meltFramePromises[index];
}

function drawMeltFrame(index) {
  const image = meltFrameImages[index];
  if (!image || index === currentMeltFrameIndex) return;

  iceContext.clearRect(0, 0, frameCanvasSize, frameCanvasSize);
  iceContext.drawImage(image, 0, 0, frameCanvasSize, frameCanvasSize);
  currentMeltFrameIndex = index;
}

function nearestLoadedFrame(index) {
  if (meltFrameImages[index]) return index;

  for (let distance = 1; distance < meltFrames.length; distance += 1) {
    const previous = index - distance;
    const next = index + distance;

    if (previous >= 0 && meltFrameImages[previous]) return previous;
    if (next < meltFrames.length && meltFrameImages[next]) return next;
  }

  return -1;
}

function requestMeltFrameWindow(index) {
  [index, index + 1, index + 2, index + 3, index + 6, index - 1, index - 2].forEach((nearbyIndex) => {
    loadMeltFrame(nearbyIndex);
  });
}

function preloadMeltFrames() {
  if (backgroundPreloadStarted) return;
  backgroundPreloadStarted = true;

  const preloadNext = async () => {
    while (nextPreloadIndex < meltFrames.length) {
      const index = nextPreloadIndex;
      nextPreloadIndex += 1;
      await loadMeltFrame(index);

      if (index === desiredMeltFrameIndex) {
        drawMeltFrame(index);
      }
    }
  };

  for (let index = 0; index < backgroundPreloadConcurrency; index += 1) {
    preloadNext();
  }
}

loadMeltFrame(0).then(() => drawMeltFrame(0));
preloadMeltFrames();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function progress() {
  if (durationSeconds <= 0) return 0;
  return clamp(1 - remainingMs / (durationSeconds * 1000), 0, 1);
}

function visualProgress(melt) {
  return melt * melt * (3 - 2 * melt);
}

function updateView() {
  const melt = progress();
  const visualMelt = visualProgress(melt);
  const now = Date.now();
  const currentFreezerPhase = freezerPhase(now);

  app.dataset.mode = activeMode;
  app.dataset.freezerPhase = currentFreezerPhase;
  app.style.setProperty("--melt", visualMelt.toFixed(4));
  updateMeltFrame(visualMelt);
  updateModeControls(currentFreezerPhase);

  if (remainingMs === 0) {
    activeMode = normalMode;
    app.dataset.mode = activeMode;
    app.dataset.freezerPhase = "off";
    updateModeControls("off");
    app.dataset.state = "done";
    startPauseButton.textContent = "완료";
    startPauseButton.disabled = true;
    completionStatus.textContent = "끝났어요.";
    completionStatus.dataset.visible = "true";
    document.title = doneTitle;
    return;
  }

  startPauseButton.disabled = false;
  app.dataset.state = isRunning ? "running" : "idle";
  startPauseButton.textContent = isRunning ? "멈춤" : remainingMs === durationSeconds * 1000 ? "시작" : "계속";
  completionStatus.textContent = "";
  completionStatus.dataset.visible = "false";
  document.title = defaultTitle;
}

function freezerPhase(now) {
  if (activeMode !== freezerMode) return "off";
  const elapsedMs = now - modeStartedAt;
  if (elapsedMs >= freezerHoldMs) return "refreezing";
  if (elapsedMs >= freezerHoldMs - freezerWarningMs) return "warning";
  return "holding";
}

function updateModeControls(currentFreezerPhase = freezerPhase(Date.now())) {
  heaterButton.classList.toggle("active", activeMode === heaterMode);
  freezerButton.classList.toggle("active", activeMode === freezerMode);
  heaterButton.setAttribute("aria-pressed", String(activeMode === heaterMode));
  freezerButton.setAttribute("aria-pressed", String(activeMode === freezerMode));
  heaterButton.setAttribute("aria-label", activeMode === heaterMode ? "히터 끄기" : "히터 켜기");
  freezerButton.setAttribute("aria-label", activeMode === freezerMode ? "냉장고 끄기" : "냉장고 켜기");
  freezerWarning.dataset.visible = String(currentFreezerPhase === "warning");
}

function updateMeltFrame(melt) {
  const framePosition = clamp(melt * (meltFrames.length - 1), 0, meltFrames.length - 1);
  const frameIndex = Math.round(framePosition);
  desiredMeltFrameIndex = frameIndex;
  requestMeltFrameWindow(frameIndex);

  if (meltFrameImages[frameIndex]) {
    drawMeltFrame(frameIndex);
    return;
  }

  const fallbackFrameIndex = nearestLoadedFrame(frameIndex);
  if (fallbackFrameIndex >= 0) drawMeltFrame(fallbackFrameIndex);

  loadMeltFrame(frameIndex).then(() => {
    if (desiredMeltFrameIndex === frameIndex) drawMeltFrame(frameIndex);
  });
}

function stopLoop() {
  cancelAnimationFrame(frameId);
  frameId = 0;
}

function applyElapsed(now) {
  if (!lastTickTime) {
    lastTickTime = now;
    return;
  }

  const previousTickTime = lastTickTime;
  const elapsedMs = Math.max(0, now - previousTickTime);
  lastTickTime = now;

  if (activeMode === heaterMode) {
    remainingMs -= elapsedMs * heaterSpeed;
    return;
  }

  if (activeMode === freezerMode) {
    const previousRefreezeMs = Math.max(0, previousTickTime - modeStartedAt - freezerHoldMs);
    const currentRefreezeMs = Math.max(0, now - modeStartedAt - freezerHoldMs);
    const refreezeMs = currentRefreezeMs - previousRefreezeMs;
    remainingMs += refreezeMs * refreezeSpeed;
    remainingMs = Math.min(remainingMs, durationSeconds * 1000);
    return;
  }

  remainingMs -= elapsedMs;
}

function tick() {
  const now = Date.now();
  applyElapsed(now);
  remainingMs = clamp(remainingMs, 0, durationSeconds * 1000);
  updateView();

  if (remainingMs <= 0) {
    isRunning = false;
    stopLoop();
    return;
  }

  frameId = requestAnimationFrame(tick);
}

function start() {
  if (remainingMs <= 0) return;
  isRunning = true;
  lastTickTime = Date.now();
  stopLoop();
  tick();
}

function pause() {
  isRunning = false;
  lastTickTime = 0;
  stopLoop();
  updateView();
}

function reset() {
  isRunning = false;
  activeMode = normalMode;
  modeStartedAt = 0;
  lastTickTime = 0;
  stopLoop();
  remainingMs = durationSeconds * 1000;
  updateView();
}

function setDuration(minutes) {
  const safeMinutes = clamp(Number(minutes) || 25, 1, 180);
  durationSeconds = safeMinutes * 60;
  customMinutes.value = safeMinutes;
  reset();
}

startPauseButton.addEventListener("click", () => {
  if (isRunning) {
    pause();
    return;
  }
  start();
});

resetButton.addEventListener("click", reset);

function toggleMode(mode) {
  if (!isRunning || remainingMs <= 0) return;

  applyElapsed(Date.now());
  activeMode = activeMode === mode ? normalMode : mode;
  modeStartedAt = Date.now();
  updateView();
}

heaterButton.addEventListener("click", () => {
  toggleMode(heaterMode);
});

freezerButton.addEventListener("click", () => {
  toggleMode(freezerMode);
});

customMinutes.addEventListener("change", () => {
  setDuration(customMinutes.value);
});

customMinutes.addEventListener("input", () => {
  if (customMinutes.value === "") return;
  setDuration(customMinutes.value);
});

fullscreenButton.addEventListener("click", async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen?.();
    return;
  }
  await document.exitFullscreen?.();
});

iceStage.addEventListener("click", () => {
  iceStage.classList.remove("ripple");
  void iceStage.offsetWidth;
  iceStage.classList.add("ripple");
});

document.addEventListener("visibilitychange", () => {
  if (!isRunning || document.visibilityState !== "visible") return;
  stopLoop();
  tick();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js?v=20260516-canvas-1").catch(() => {});
  });
}

updateView();
