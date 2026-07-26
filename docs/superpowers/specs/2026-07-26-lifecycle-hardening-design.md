# Kinetic lifecycle hardening design

## Goal

Fix the confirmed `SkeletonManager` lifecycle gaps without changing its public
API or transferring ownership of a caller-provided `CameraManager`.

## Scope

- Track whether the active camera was created internally.
- Dispose only internally owned cameras.
- Clean up partial resources when initialization fails.
- Reject concurrent or repeated initialization until `dispose()` is called.
- Make `start()` before successful initialization a safe no-op.
- Prevent stale asynchronous inference from updating state or emitting events
  after `stop()`, `dispose()`, or a later run.
- Treat RAF identifier `0` as cancellable.
- Pin the MediaPipe CDN assets to the installed runtime version.
- Add automated lifecycle regression tests using Node's built-in test runner.
- Update README and CLAUDE.md to reflect the resulting behavior.

The detector output, event names, landmark order, coordinate units, mirroring
semantics, and method signatures remain unchanged.

## Lifecycle design

`SkeletonManager` records camera ownership separately from the camera
reference. `init()` uses local camera and detector variables until
initialization succeeds, then publishes them to the instance and starts the
loop. If initialization fails, it disposes any detector created during the
attempt and disposes the camera only when Kinetic created it.

An `isInitializing` guard rejects overlapping initialization. An existing
detector or camera rejects repeated initialization with an error instructing
the caller to run `dispose()` first. This avoids silently replacing live
resources.

`start()` starts only when both a camera and detector exist. Each successful
start receives a monotonically increasing run token. `stop()` invalidates that
token and cancels a pending RAF. The async loop checks the token before and
after inference and before scheduling another frame, so work from an older run
cannot update cached poses or emit an event.

`dispose()` stops inference, disposes the detector, and disposes an internally
owned camera. It only releases the reference to a caller-owned camera.

## Testing

Tests exercise the built ESM output with controlled fake camera, detector,
RAF, and TensorFlow dependencies. The regression cases cover:

1. `start()` before `init()` does not prevent initialization from starting.
2. Internal camera disposal and external camera preservation.
3. Cleanup after initialization failure.
4. Rejection of concurrent and repeated initialization.
5. Cancellation when RAF returns identifier `0`.
6. No cached result or event after stopping an in-flight inference.
7. A later run is not affected by completion from an earlier run.

The project will use `node --test`; no additional test dependency is required.
The final verification is `npm test`, `npx tsc --noEmit`, `npm run build`, and
`git diff --check`.
