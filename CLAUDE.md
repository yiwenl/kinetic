# CLAUDE.md

## Project purpose

Kinetic is a small, browser-only TypeScript library for real-time full-body
skeleton tracking. It combines TensorFlow.js Pose Detection, the MediaPipe
BlazePose runtime, and `camera-manager`.

Keep the core library framework-agnostic and focused on pose detection. Avoid
adding UI, rendering, gesture recognition, or application-specific skeleton
logic to `SkeletonManager`.

## Important files

- `src/SkeletonManager.ts` — detector, camera, loop, events, and getters.
- `src/index.ts` — package exports.
- `README.md` — consumer-facing usage documentation.
- `test/index.html` and `test/demo.js` — browser camera and 2D overlay demo.
- `rollup.config.js` — ESM and UMD builds.
- `vite.config.js` — local demo server and source alias.
- `tsconfig.json` — strict TypeScript and declaration settings.
- `.github/workflows/build.yml` — Node.js 20 build check.

Files under `dist/` are generated and ignored. Do not edit them directly.

## Landmark coordinate contract

BlazePose returns 33 named body keypoints for its single detected pose in two
coordinate spaces:

### Image keypoints

`pose.keypoints` contains image-space points. Its `x` and `y` values are pixel
coordinates in the input image, not normalized values. These points are best
for drawing a skeleton over the camera feed.

```ts
type ImageKeypoint = {
  x: number;
  y: number;
  z?: number;
  score?: number;
  name?: string;
};
```

### 3D keypoints

`pose.keypoints3D` contains world-space 3D points. Its `x`, `y`, and `z` values
are expressed in meters within an approximately 2 × 2 × 2 metre coordinate
space. The hip centre is the origin `(0, 0, 0)`, and the Z axis is
perpendicular to the XY plane through that origin.

`getVertices()` returns the first pose's 33 world-space points as
`[x, y, z][]`. It intentionally drops each keypoint's `score` and `name`.
Do not describe this result as 2D or as screen pixels.

The raw `skeleton-detected` event provides the complete Pose Detection result,
including both `keypoints` and `keypoints3D`.

## Architecture and lifecycle

1. `init(cameraManager?)` uses a caller-provided camera or creates and starts
   an internal `CameraManager`.
2. TensorFlow.js waits for the registered WebGL backend to become ready.
3. A BlazePose detector is created with the MediaPipe runtime and remote
   assets from jsDelivr.
4. A sequential `requestAnimationFrame` loop passes the current video to
   `estimatePoses()`.
5. The latest pose array is cached and emitted through `skeleton-detected`.
6. `getVertices()` exposes the first pose's `keypoints3D`.
7. Each inference run has a token. `stop()` invalidates the token so an
   in-flight result cannot update state or emit an event afterward.
8. `dispose()` stops inference, disposes the detector, and disposes the camera
   only when Kinetic created it.

The event is emitted after every successful inference, including results whose
`poses` array is empty. Consumers must check array lengths.

BlazePose currently supports one pose, so `getPoseCount()` is effectively `0`
or `1`, even though the API returns a general count.

## Mirroring

`mirror` defaults to `true` and is passed to Pose Detection as
`flipHorizontal`. Therefore both `pose.keypoints` and `pose.keypoints3D` in
the emitted result are already horizontally flipped when mirroring is enabled.

`SkeletonManager` does not apply CSS to the video element. The demo mirrors
the visible video separately with `transform: scaleX(-1)` so it aligns with
the flipped image keypoints. Keep detector mirroring, video presentation, and
overlay mapping consistent.

## Public API

```ts
import { SkeletonManager } from 'kinetic';

const manager = new SkeletonManager({
  modelType: 'full',
  mirror: true,
});

manager.addEventListener(
  SkeletonManager.EVENTS.SKELETON_DETECTED,
  (event) => {
    const poses = (event as CustomEvent).detail.poses;
    const worldVerticesInMeters = manager.getVertices();
  },
);

manager.addEventListener(SkeletonManager.EVENTS.ERROR, (event) => {
  const error = (event as CustomEvent).detail.error;
});

await manager.init();

// Later:
manager.stop();
manager.dispose();
```

Options:

- `modelType` accepts `'lite'`, `'full'`, or `'heavy'` and defaults to
  `'full'`. Accuracy and resource use increase in that order.
- `mirror` defaults to `true`.

Methods and properties:

- `init(cameraManager?)` initializes the camera and remote detector, then
  starts inference. Concurrent or repeated calls reject until `dispose()`.
- `start()` starts inference after successful initialization. Before
  initialization it is a safe no-op.
- `stop()` stops inference without stopping the camera.
- `dispose()` stops inference, disposes BlazePose, and disposes an internally
  owned camera. It leaves a caller-provided camera running.
- `getVertices()` returns the first pose's 33 world-space 3D points in metres.
- `getPoseCount()` returns the number of poses in the latest result.
- `video` returns the current camera's detached `HTMLVideoElement`, or `null`.

Events:

- `SkeletonManager.EVENTS.SKELETON_DETECTED` (`skeleton-detected`) provides
  `{ poses }`.
- `SkeletonManager.EVENTS.ERROR` (`error`) provides `{ error }` for inference
  failures.

Initialization errors reject `init()` directly; they are not emitted through
the `error` event.

## Runtime constraints

- The package requires a browser DOM, camera APIs, WebGL, and a secure context
  such as HTTPS or localhost.
- Camera permission may require a user gesture.
- MediaPipe Pose assets are downloaded from jsDelivr at the pinned version
  `0.5.1675469404`, so first initialization requires network access.
- The package bundles TensorFlow.js, Pose Detection, MediaPipe, and
  `camera-manager`; current unminified ESM and UMD outputs are about 3 MB each.
- Use the ESM named imports in browser tooling. The current CommonJS `require`
  export points to a `.js` UMD file inside a `"type": "module"` package and is
  not a reliable Node.js CommonJS entry point.

## Remaining health-check findings

The core lifecycle issues are covered by automated regression tests. These
lower-priority improvements remain:

- Calling `dispose()` while `init()` itself is still awaiting TensorFlow or
  detector creation does not cancel that initialization.
- Export explicit event-detail types so consumers do not need casts around
  `CustomEvent`.
- The bundle is intentionally self-contained but large. If package size
  becomes important, make major ML dependencies peer/external dependencies
  as an explicit packaging decision.

Preserve event names, landmark ordering, coordinate units, and mirroring
semantics unless making an explicit breaking release.

## Development workflow

CI currently targets Node.js 20.

Install dependencies and run the browser demo:

```bash
npm ci
npm run dev
```

Build the ESM, UMD, source maps, and declarations:

```bash
npm run build
```

Type-check without generating files:

```bash
npx tsc --noEmit
```

Run the automated lifecycle regression tests:

```bash
npm test
```

For browser behavior changes, also manually verify:

1. Camera permission succeeds and the video appears.
2. A visible body produces 33 image keypoints and 33 world-space 3D keypoints.
3. `getVertices()` returns 33 finite `[x, y, z]` values in metres.
4. The mirrored video and 2D overlay remain aligned.
5. Empty results update the pose count to zero.
6. Detection errors emit the documented error event.
7. Stop prevents further inference without stopping a caller-owned camera.
8. Dispose releases the detector and any internally owned camera.
9. A caller-provided `CameraManager` remains under caller ownership.

## Change guidelines

- Never discard the Z coordinate or describe `getVertices()` as 2D.
- Keep image-space overlay transforms separate from world-space 3D data.
- Avoid overlapping inference calls; the current loop waits for
  `estimatePoses()` before scheduling the next frame.
- Preserve camera ownership: do not stop or dispose a caller-provided camera.
- Keep public types explicit and avoid `any` in new API surface.
- Update `README.md` and this file when public behavior changes.
- Run `npm run build` and `npx tsc --noEmit` before considering a change
  complete.
- Do not commit `dist/`, `node_modules/`, local environment files, or captured
  camera media.
