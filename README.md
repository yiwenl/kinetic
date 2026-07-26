# Kinetic

A lightweight, browser-only full-body skeleton tracking library built with
TensorFlow.js Pose Detection, MediaPipe BlazePose, and `camera-manager`.

## Features

- Real-time full-body tracking with 33 BlazePose keypoints.
- Image-space keypoints for overlays and world-space 3D keypoints in metres.
- `lite`, `full`, and `heavy` model variants.
- Optional horizontal result mirroring, enabled by default.
- Internal camera management or reuse of a caller-provided `CameraManager`.
- TypeScript declarations and self-contained ESM and UMD bundles.

## Installation

```bash
npm install kinetic
```

## Landmark coordinate spaces

Each detected pose contains the same 33 body landmarks in two coordinate
spaces:

| Result | Coordinate space | Units | Best used for |
| :--- | :--- | :--- | :--- |
| `pose.keypoints` | Input image space | Pixels for `x` and `y` | Drawing a skeleton over the camera feed |
| `pose.keypoints3D` | World space | Metres for `x`, `y`, and `z` | 3D interaction, motion, and spatial measurements |

The 3D landmarks use an approximately 2 × 2 × 2 metre coordinate space. The
hip centre is `(0, 0, 0)`, and the Z axis is perpendicular to the XY plane
through the hip centre.

`getVertices()` returns the first pose's 33 world-space points as
`[x, y, z][]`. It removes the original keypoint names and confidence scores.
This result is 3D and is not expressed in screen pixels.

## Usage

```typescript
import { SkeletonManager } from 'kinetic';

const manager = new SkeletonManager({
  modelType: 'full', // 'lite', 'full', or 'heavy'
  mirror: true,
});

manager.addEventListener(
  SkeletonManager.EVENTS.SKELETON_DETECTED,
  (event) => {
    const poses = event.detail.poses;

    // 33 world-space 3D points in metres for the first detected pose.
    const vertices = manager.getVertices();

    console.log(`Detected ${manager.getPoseCount()} pose(s)`);
    if (vertices.length > 0) {
      console.log('Nose vertex:', vertices[0]);
    }
  },
);

manager.addEventListener(SkeletonManager.EVENTS.ERROR, (event) => {
  console.error('Skeleton detection failed:', event.detail.error);
});

await manager.init();

if (manager.video) {
  document.body.appendChild(manager.video);
}

// Later:
manager.stop();
manager.dispose();
```

`mirror: true` flips the detected keypoints. It does not apply CSS to the
video element; mirror a visible preview separately when an overlay must align
with it.

## Camera ownership

Without an argument, `init()` creates and starts an internal camera:

```typescript
await manager.init();
```

That camera belongs to Kinetic and is released by `dispose()`.

To share an existing camera, start it before passing it to Kinetic:

```typescript
import { CameraManager, SkeletonManager } from 'kinetic';

const camera = new CameraManager();
await camera.start();

const manager = new SkeletonManager();
await manager.init(camera);

manager.dispose(); // Does not stop or dispose `camera`.
camera.dispose();  // The caller retains ownership.
```

If initialization fails after an internal camera starts, Kinetic releases that
camera automatically. Concurrent initialization and repeated initialization
without an intervening `dispose()` reject with an error.

## API

### `new SkeletonManager(options?)`

- `modelType?: 'lite' | 'full' | 'heavy'` — defaults to `'full'`.
- `mirror?: boolean` — defaults to `true` and controls
  `estimatePoses(..., { flipHorizontal })`.

### `init(cameraManager?)`

Initializes TensorFlow.js and BlazePose, then starts inference. When no camera
is supplied, Kinetic creates and owns one. A caller-provided camera must
already be running and remains caller-owned.

Call `dispose()` before initializing the same manager again.

### `start()`

Starts or resumes inference after successful initialization. Calling it before
initialization is a safe no-op.

### `stop()`

Stops inference without stopping the camera. An inference already in flight is
ignored when it completes.

### `dispose()`

Stops inference, disposes BlazePose, clears cached results, and disposes an
internally owned camera. It never stops or disposes a caller-provided camera.

### `getVertices()`

Returns the first pose's 33 world-space 3D keypoints in metres as
`[x, y, z][]`, or `[]` when no pose is available.

### `getPoseCount()`

Returns the latest pose count. BlazePose currently supports one pose, so this
is currently `0` or `1`.

### `video`

Returns the active camera's `HTMLVideoElement`, or `null` before initialization
and after disposal.

## Events

| Event constant | Value | Detail |
| :--- | :--- | :--- |
| `SkeletonManager.EVENTS.SKELETON_DETECTED` | `skeleton-detected` | `{ poses }`, including empty results |
| `SkeletonManager.EVENTS.ERROR` | `error` | `{ error }` for frame-inference failures |

Initialization failures reject `init()` directly.

## Development

```bash
npm ci
npm test
npm run dev
npm run build
npx tsc --noEmit
```

The Vite demo is normally available at
[http://localhost:5173](http://localhost:5173).

## License

ISC
