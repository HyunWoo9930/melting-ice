# Melting Ice Study Timer Design

## Goal

Make a light, almost empty-feeling web site where a user sets a study time and watches one ice cube slowly melt until the session ends. The first screen should be the actual tool, not a landing page.

## Reference Read

### woodenfish.online

- The page is centered on one ritual object and one repeatable action.
- Utility controls are small: count, reset, auto, fullscreen.
- The mood comes from restraint, spacing, simple typography, and a quiet interaction loop.
- The object is large enough to feel ceremonial, while text stays secondary.

### damta.world

- The site behaves like a small browser toy, not a productivity dashboard.
- It is mobile-first and touch-friendly.
- The simulation detail is more important than feature count.
- Copy is casual, but the primary appeal is "do the thing immediately."

## Product Direction

### Concept

`Melting Ice` is a quiet study timer. The user chooses a duration, starts the session, and a translucent ice cube gradually shrinks, softens, drips, and leaves a small puddle. When the timer reaches zero, the cube is mostly gone and the page enters a calm finished state.

### Audience

- Students who like ambient study reels.
- People who want a non-gamified focus timer.
- Mobile users who want something they can open quickly and keep beside them.

### Principles

- No dashboard feeling.
- No account, backend, feed, ranking, or heavy settings.
- One visible object, one time setting, one main action.
- Pale ice background, cobalt blue interface, glassy ice texture, small blue water details.
- The page should feel like an ambient object, not a productivity app.

## Experience

### First View

- Small top label: `이 얼음이 녹기 전에`
- A single central ice cube scene.
- A single custom minute input.
- Main control: start / pause / resume.
- Secondary controls: reset and fullscreen.
- No explanatory copy below the timer.
- No visible progress bar or percent label; progress is expressed through the melting ice.

### Focus View

- After the user presses start, the header, duration controls, and bottom buttons disappear.
- The page becomes a quiet full-screen ice scene.
- The melting ice remains central while compact top controls stay reachable.
- The user reads progress from the ice, not from numbers or bars.
- Two small icon controls sit at the top while running:
  - Pause freezes the timer and keeps the current melt frame.
  - Reset restores the selected duration and full cube.
  - Heater changes only the page background to a muted warm red and melts 1.3x faster.
  - Freezer changes only the page background to a stronger cold blue, pauses melting for 10 minutes, then refreezes the ice at 1.15x if left on.
  - During the final 5 seconds before refreezing starts, a small warning appears: `위험! 곧 얼음이 다시 얼어요!`

### Timer Behavior

- Before start, the cube is full-size and glossy.
- During focus, progress drives melting:
  - a transparent VP9 WebM video generated from the 256 WebP frames is seeked by timer progress;
  - the app updates the video position by target frame instead of loading individual images during focus;
  - the video is rebuilt from four solid-looking photographic keyframes via the generated WebP sequence;
  - the cube lowers and compresses from the original camera angle;
  - the pale sky-blue puddle grows gradually behind the transparent video;
  - completion leaves only the final puddle frame.
- Pausing freezes the timer and the visual state.
- Reset restores the selected duration and full cube.
- At completion, the page keeps the final melted ice frame, shows a small `끝났어요.` status, changes the page title, and keeps only the reset action available.

### Micro Interaction

- Tapping the ice creates a brief ripple and a small sparkle/droplet.
- The tap does not change timer progress, so the study timer remains honest.

## Visual System

### Mood

Calm, cold, slightly dreamy, and study-reels adjacent. Avoid loud gradients, overly decorative cards, or a generic SaaS look.

### Layout

- Single full-height screen with a centered vertical composition.
- The ice object occupies the visual center.
- Controls sit low, compact, and thumb-friendly.
- The transparent melt video keeps the ice separate from the temperature background, so heater/freezer colors do not tint the ice or reveal a square boundary.
- On desktop, the layout remains narrow and object-focused instead of spreading into columns.

### Color

- Background: `#EDF1F5`.
- Text and controls: `#0145F2`.
- Water tint: light sky blue, closer to ice water than saturated cobalt.
- Secondary text and borders use alpha versions of `#0145F2`.
- Ice frames can retain blue/white photographic detail, but the interface itself stays in the two-color system.

### Typography

- System sans-serif.
- Large timer numerals with calm weight.
- Compact labels and controls.
- No negative letter spacing.

## Technical Shape

### Files

- `index.html`: Vite app shell and install metadata.
- `src/App.tsx`: timer state, duration controls, fullscreen, temperature modes, video frame seeking, and service-worker registration.
- `src/App.test.tsx`: interaction and melt-video regression coverage.
- `src/frameGenerator.test.ts`: path regression coverage for frame generation.
- `styles.css`: all visual design and animation.
- `scripts/build_melt_frames.py`: generates the 256-frame transparent WebP melt sequence from the source keyframes while filling the ice interior in the alpha mask.
- `scripts/build_melt_video.sh`: turns the generated WebP sequence into the transparent `public/assets/ice-melt.webm` playback asset.
- `public/assets/keyframes/ice-key-00.png` to `public/assets/keyframes/ice-key-100.png`: solid-looking source melt states.
- `public/assets/frames/ice-000.webp` to `public/assets/frames/ice-255.webp`: generated source sequence used to build the melt video.
- `public/assets/ice-melt.webm`: transparent VP9 melt video used by the app.
- `public/service-worker.js`: app-shell and frame caching for production.
- `design.md`: this design reference.

### State

- `durationSeconds`
- `remainingMs`
- `isRunning`
- `frameId`
- `lastTickTime`
- `activeMode`
- `modeStartedAt`
- `pendingVideoMelt`
- `lastSyncedVideoFrame`

### Accessibility

- Buttons use clear labels.
- Ice scene is an interactive button with a descriptive label.
- Motion is reduced when `prefers-reduced-motion` is enabled.

## Out Of Scope

- Login or saved history.
- Social/community features.
- Audio/ASMR.
- Realistic video rendering.
- Analytics or tracking.
- Task lists, streaks, scores, or achievements.

## Done Check

- `npm run dev` shows the usable time-setting screen immediately.
- `npm test` and `npm run build` pass.
- The timer can start, pause, resume, and reset.
- Changing duration updates the display and melt state.
- The ice visibly melts as time passes.
- Mobile and desktop widths remain readable without overlap.
