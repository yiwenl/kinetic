# Kinetic

A small browser-only TypeScript library for real-time full-body skeleton
tracking with MediaPipe Tasks Vision and `camera-manager`.

## Features

- 33 named full-body landmarks.
- Compatibility image keypoints in pixels.
- World-space 3D keypoints in metres.
- Access to the untouched native `PoseLandmarkerResult`.
- `lite`, `full`, and `heavy` model variants.
- Mirrored compatibility coordinates and automatic/caller-owned camera modes.
- Self-contained ESM, CommonJS, and UMD builds with TypeScript declarations.

## Installation

```bash
npm install kinetic
```

## Landmark coordinate spaces

Every `skeleton-detected` event contains `{ poses, result }`. These are two
representations of the same native detection:

| Output | Coordinate space and units | Mirroring | Best used for |
| :--- | :--- | :--- | :--- |
| `poses[].keypoints` | X/Y in source-video pixels; Z is relative depth | X mirrored when `mirror: true` | Camera overlays |
| `poses[].keypoints3D` | World-space X/Y/Z in metres | World X negated when `mirror: true` | 3D interaction and spatial measurements |
| `result.landmarks` | Native normalized image coordinates and relative Z | Never mirrored | Direct Tasks Vision integrations |
| `result.worldLandmarks` | Native world-space X/Y/Z in metres | Never mirrored | Unmodified model output |

Both compatibility arrays contain the established 33 BlazePose names and map
native `visibility` to `score`. A pose's `score` is the average of its available
image-landmark visibility values.

`getVertices()` returns the first compatibility pose's 33 world-space points
as `[x, y, z][]`. These values are 3D and measured in metres, not pixels and
not 2D coordinates.

## Usage

```typescript
import {
  SkeletonManager,
  type SkeletonDetectedEventDetail,
} from 'kinetic';

const manager = new SkeletonManager({
  modelType: 'full', // 'lite', 'full', or 'heavy'
  mirror: true,
});

manager.addEventListener(
  SkeletonManager.EVENTS.SKELETON_DETECTED,
  (event) => {
    const { poses, result } = (
      event as CustomEvent<SkeletonDetectedEventDetail>
    ).detail;

    console.log(poses[0]?.keypoints);        // pixel compatibility points
    console.log(poses[0]?.keypoints3D);      // compatibility metres
    console.log(result.landmarks);           // native normalized points
    console.log(result.worldLandmarks);      // native metres
    console.log(manager.getVertices());      // first pose, metres
  },
);

await manager.init();

if (manager.video) document.body.appendChild(manager.video);

// Later:
manager.stop();
manager.dispose();
```

`mirror` changes compatibility coordinates only. Kinetic does not add CSS to
the video element; mirror the visible preview separately when needed.

## Camera ownership and lifecycle

Calling `init()` without an argument creates and starts an internal camera.
Kinetic disposes it on initialization failure or `dispose()`.

To share a camera, start it first and pass it to Kinetic:

```typescript
import { CameraManager, SkeletonManager } from 'kinetic';

const camera = new CameraManager();
await camera.start();

const manager = new SkeletonManager();
await manager.init(camera);

manager.dispose(); // Leaves camera untouched.
camera.dispose();  // Caller owns it.
```

Concurrent initialization and repeated initialization without `dispose()`
reject. `start()` before initialization is a safe no-op. `stop()` stops frame
processing without releasing the model or camera, and `dispose()` closes the
Pose Landmarker.

## API

- `new SkeletonManager({ modelType?, mirror? })` — defaults to `full` and
  `mirror: true`.
- `init(cameraManager?)` — prepares Tasks Vision and starts inference.
- `start()` / `stop()` — resume or pause inference scheduling.
- `dispose()` — releases the landmarker and an internally owned camera.
- `getVertices()` — first pose's 33 world-space 3D metre points.
- `getPoseCount()` — latest compatibility pose count (`0` or `1`).
- `video` — current `HTMLVideoElement`, or `null` when uninitialized/disposed.

## Events

| Event | Detail | Behavior |
| :--- | :--- | :--- |
| `skeleton-detected` | `{ poses, result }` | Emitted after each processed frame, including empty detections |
| `error` | `{ error }` | Emitted for frame inference failures; later frames can still run |

The `result` value is the exact object returned by Tasks Vision and is never
converted or mirrored. Initialization errors reject `init()` directly.

## Runtime assets and performance

Kinetic uses `@mediapipe/tasks-vision@1.0.1` and loads matching WASM assets
from its pinned jsDelivr `@1.0.1/wasm` path. `modelType` selects the official
versioned float16 Pose Landmarker bundle:

| `modelType` | Model bundle |
| :--- | :--- |
| `lite` | `pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |
| `full` | `pose_landmarker_full/float16/1/pose_landmarker_full.task` |
| `heavy` | `pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task` |

`detectForVideo()` is synchronous on the browser main thread and runs once per
new `video.currentTime`. Worker offloading is not implemented. First use needs
network access, and camera access requires HTTPS or localhost.

## Development

```bash
npm ci
npm test
npm run build
npx tsc --noEmit
npm run dev
```

The demo is available at [http://localhost:5173](http://localhost:5173).

## License

ISC
