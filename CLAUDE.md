# CLAUDE.md

## Project purpose

Kinetic is a browser-only TypeScript library for real-time 33-point full-body
skeleton tracking. It combines MediaPipe Tasks Vision `PoseLandmarker` with
`camera-manager`, preserving a Pose Detection-like compatibility result while
also exposing the untouched native result.

Keep UI, rendering, gestures, application-specific movement logic, and worker
orchestration outside `SkeletonManager`.

## Important files

- `src/SkeletonManager.ts` — Tasks runtime, camera ownership, frame loop,
  events, cache, and public methods.
- `src/poseCompatibility.ts` — pure native-to-compatibility conversion and the
  fixed 33-name ordering.
- `src/index.ts` — public exports.
- `test/SkeletonManager.test.js` — runtime configuration, event, frame, and
  lifecycle tests against the built ESM artifact.
- `test/poseCompatibility.test.js` — coordinate, unit, name, score, mirror,
  and malformed-result tests.
- `test/index.html` and `test/demo.js` — browser camera/2D overlay demo.
- `rollup.config.js` — self-contained ESM, CommonJS, and UMD outputs.

`dist/` is generated. Never edit it directly.

## Runtime and model contract

- Runtime dependency: `@mediapipe/tasks-vision` exactly `1.0.1`.
- WASM base URL:
  `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm`.
- `modelType` maps to official float16 version `1` model bundles:
  - `lite` → `pose_landmarker_lite/float16/1/pose_landmarker_lite.task`
  - `full` → `pose_landmarker_full/float16/1/pose_landmarker_full.task`
  - `heavy` → `pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`
- Running mode is `VIDEO`; `numPoses` is `1`.
- Tasks Vision and camera-manager are bundled.
- Synchronous `detectForVideo(video, performance.now())` runs once per new
  `video.currentTime` on the main thread.

Keep runtime/WASM versions aligned. Any asset change must update source,
tests, README, and this file together.

## Landmark and event contracts

`skeleton-detected` detail is `{ poses, result }`.

`poses` is the compatibility result. Each valid pose has exactly 33 ordered,
named points:

- `keypoints`: source-video pixel X/Y, native relative Z, visibility as
  optional `score`, and the established BlazePose `name`.
- `keypoints3D`: world-space X/Y/Z in metres, visibility as optional `score`,
  and the same `name`.
- `score`: arithmetic mean of available image-landmark visibility values, or
  `undefined` if none exist.

When `mirror: true`, compatibility image X is
`videoWidth - normalizedX * videoWidth`; compatibility world X is negated.
Y and Z do not change.

`result` is the exact native `PoseLandmarkerResult`. Its `landmarks` remain
normalized, `worldLandmarks` remain in metres, and neither is mirrored.

`getVertices()` returns the first compatibility pose's `keypoints3D` as 33
`[x, y, z]` entries. This API is 3D and measured in metres. Never document it
as 2D, normalized image coordinates, or pixels.

## Lifecycle contract

1. `init()` rejects concurrent/repeated initialization until `dispose()`.
2. Without an argument, the manager creates/starts a camera and disposes it on
   failure or normal disposal.
3. A supplied camera remains entirely caller-owned.
4. Runtime resources enter instance state only after initialization succeeds.
5. `start()` before initialization is a safe no-op.
6. Run tokens prevent stopped or stale callbacks from publishing results.
7. `stop()` cancels RAF identifier zero as well as positive identifiers.
8. Inference errors emit `{ error }` and later frames remain processable.
9. `dispose()` calls `PoseLandmarker.close()`, clears cached poses, and releases
   only an internally owned camera.
10. `dispose()` invalidates pending initialization. Once the awaited operation
    returns, `init()` rejects and releases local resources instead of publishing
    them.

The native call is synchronous, but retain the post-inference run-token check:
a test landmarker or callback can synchronously stop the manager during the
call.

## Public API

```ts
const manager = new SkeletonManager({
  modelType: 'full',
  mirror: true,
});

await manager.init(optionalCameraManager);
manager.start();
manager.stop();
manager.dispose();
manager.getVertices();
manager.getPoseCount();
manager.video;
```

Defaults are `modelType: 'full'` and `mirror: true`. Preserve the event names
`skeleton-detected` and `error`, the 33-point ordering, 3D metre units, and the
dual `{ poses, result }` event unless making an explicit breaking release.

Typed consumers can use `SkeletonDetectedEventDetail`,
`SkeletonErrorEventDetail`, and `SkeletonManagerEventMap`. The package exports
ESM, `dist/kinetic.cjs` for `require()`, and a browser UMD artifact.

## Development workflow

```bash
npm ci
npm test
npm run build
npx tsc --noEmit
npm run dev
```

`npm test` builds before importing `dist/kinetic.esm.js`. Before finishing a
behavior change, verify:

1. all 33 image and world points and names;
2. compatibility pixel coordinates versus native normalized coordinates;
3. `keypoints3D` and `getVertices()` remain finite 3D metre values;
4. mirrored overlay alignment and unmodified native data;
5. empty detection and recovery from transient errors;
6. stop/dispose and caller-owned camera behavior;
7. all three model variants initialize;
8. no browser console errors.

## Change guidelines

- Put coordinate conversion and naming in `poseCompatibility.ts`.
- Never discard Z or describe `keypoints3D`/`getVertices()` as 2D.
- Preserve native `result` identity and do not mirror it.
- Never process the same `video.currentTime` twice.
- Preserve camera ownership and run-token checks.
- Add a failing behavior test before production changes.
- Update README and this file for public/API/asset changes.
- Do not commit `dist/`, `node_modules/`, environment files, or camera media.
