# Kinetic Tasks Vision migration design

## Goal

Replace the TensorFlow.js Pose Detection wrapper with MediaPipe Tasks Vision
`PoseLandmarker` while preserving Kinetic's current API, lifecycle guarantees,
mirroring, and 3D coordinate contract.

## Dependency and asset policy

- Use the stable `@mediapipe/tasks-vision` version `1.0.1`.
- Remove `@tensorflow-models/pose-detection`, TensorFlow.js packages, and
  unused `gl-matrix`.
- Bundle Tasks Vision and `camera-manager` into the ESM and UMD outputs.
- Load matching WASM assets from the pinned
  `@mediapipe/tasks-vision@1.0.1/wasm` CDN path.
- Map `lite`, `full`, and `heavy` to their versioned official Pose Landmarker
  float16 model bundles.

## Compatibility contract

The public class, options, methods, video property, and event names remain
unchanged.

`skeleton-detected` continues to expose `event.detail.poses`. Each
compatibility pose contains:

- `keypoints`: 33 points with pixel X/Y, relative Z, visibility as `score`,
  and the established BlazePose keypoint name;
- `keypoints3D`: 33 world-space points in metres, with visibility as `score`
  and the same name;
- a pose-level score derived from available landmark visibility values.

The event additionally exposes `event.detail.result`, containing the untouched
native `PoseLandmarkerResult`. Its `landmarks` remain normalized, its
`worldLandmarks` remain in metres, and neither array is mirrored.

When `mirror` is true, compatibility image X becomes
`videoWidth - normalizedX * videoWidth`, and compatibility world X is negated.
The compatibility Z values and Y values are unchanged. `getVertices()` keeps
returning the first compatibility pose's mirrored world-space `[x, y, z]`
values.

## Architecture and lifecycle

Add a pure conversion module that maps native pose results into the existing
Pose-like structure. Keep the current tested ownership and lifecycle state in
`SkeletonManager`, replacing only TensorFlow/MediaPipe wrapper hooks with
Tasks Vision fileset and landmarker hooks.

The loop calls `detectForVideo(video, performance.now())` once per new
`video.currentTime`, caches compatibility poses, and emits both output forms.
The existing run token, initialization guards, camera ownership, RAF-zero
handling, and disposal rules remain in force. `PoseLandmarker.close()` replaces
the previous detector's `dispose()` call.

Tasks Vision detection is synchronous on the browser thread. Web Worker
offloading is intentionally outside this migration so runtime replacement and
threading changes can be measured independently.

## Testing and documentation

Pure adapter tests cover all 33 names, normalized-to-pixel conversion,
world-space metres, visibility scores, mirror behavior, and empty results.
Manager regression tests retain ownership and initialization coverage and are
updated for Tasks Vision configuration, model selection, frame deduplication,
native `result`, stop/dispose, and error events.

README and CLAUDE.md will document the native and compatibility outputs,
model mapping, pinned runtime assets, synchronous inference, and preserved
camera ownership semantics.
