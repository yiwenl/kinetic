# Kinetic Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `SkeletonManager` release owned resources and prevent stale or
invalid lifecycle operations without changing its public consumer API.

**Architecture:** Add protected dependency hooks so the browser integrations
can be replaced by deterministic test doubles. Keep initialization resources
local until success, record camera ownership, and use an incrementing run token
to invalidate asynchronous inference from older runs.

**Tech Stack:** TypeScript 5.9, Node.js built-in test runner, Rollup,
TensorFlow.js Pose Detection, MediaPipe BlazePose, CameraManager.

## Global Constraints

- Preserve all existing method signatures, event names, landmark ordering,
  coordinate units, and mirror behavior.
- Never stop or dispose a caller-provided `CameraManager`.
- Add no runtime or development dependencies.
- Pin MediaPipe Pose assets to version `0.5.1675469404`.

---

### Task 1: Add deterministic lifecycle tests

**Files:**
- Create: `test/SkeletonManager.test.js`
- Modify: `package.json:18-24`
- Modify: `src/SkeletonManager.ts:13-123`

**Interfaces:**
- Consumes: existing `SkeletonManager` constructor and lifecycle methods.
- Produces: protected `createCameraManager()`, `readyTensorFlow()`, and
  `createPoseDetector(config)` hooks used by the test subclass.

- [ ] **Step 1: Add the Node test script and first failing initialization test**

Create a `TestSkeletonManager` subclass that overrides the three dependency
hooks with fake camera, detector, and readiness implementations. Assert that
`await manager.init()` starts its fake detector loop rather than touching
browser camera APIs.

Set:

```json
"test": "npm run build && node --test test/*.test.js"
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`

Expected: FAIL because the current implementation constructs
`CameraManager` and calls TensorFlow/MediaPipe directly instead of using the
subclass hooks.

- [ ] **Step 3: Add the minimal dependency hooks**

Add:

```ts
protected createCameraManager(): CameraManager;
protected readyTensorFlow(): Promise<void>;
protected createPoseDetector(
  config: poseDetection.BlazePoseMediaPipeModelConfig
): Promise<poseDetection.PoseDetector>;
```

Route `init()` through these methods without otherwise changing lifecycle
behavior.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test`

Expected: PASS.

### Task 2: Fix initialization and camera ownership

**Files:**
- Modify: `test/SkeletonManager.test.js`
- Modify: `src/SkeletonManager.ts:13-78`

**Interfaces:**
- Consumes: dependency hooks from Task 1.
- Produces: `ownsCamera` and `isInitializing` state with guarded `init()` and
  ownership-aware `dispose()`.

- [ ] **Step 1: Add failing tests**

Add separate cases asserting:

- an internally created camera is disposed;
- a caller-provided camera is not stopped or disposed;
- internal camera is disposed when detector creation rejects;
- repeated `init()` rejects until `dispose()` is called;
- concurrent `init()` rejects while the first call is pending;
- calling `start()` before `init()` does not prevent later initialization.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: the ownership, cleanup, initialization guard, and early-start cases
fail against the current implementation.

- [ ] **Step 3: Implement minimal lifecycle state**

Use local camera/detector variables in `init()`, set `isInitializing` in
`try/finally`, reject when initialization is active or resources already
exist, and publish resources only after successful setup. On failure, dispose
only internally created resources. Record `ownsCamera` after success.

Make `start()` return before changing state unless both camera and detector
exist. Make `dispose()` dispose the detector plus an owned camera, then reset
all references and ownership state.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: all initialization and ownership tests pass.

### Task 3: Invalidate stale inference

**Files:**
- Modify: `test/SkeletonManager.test.js`
- Modify: `src/SkeletonManager.ts:56-100`

**Interfaces:**
- Consumes: initialized manager from Tasks 1-2.
- Produces: monotonically increasing `runToken` checked by
  `loop(runToken: number)`.

- [ ] **Step 1: Add failing async-loop tests**

Use a deferred detector result and fake RAF implementation. Assert:

- `stop()` cancels RAF identifier `0`;
- resolving inference after `stop()` does not update pose count or emit
  `skeleton-detected`;
- resolving inference from a prior run after a new `start()` cannot update
  state or schedule another frame.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: stale inference still emits/updates, and RAF identifier `0` is not
cancelled.

- [ ] **Step 3: Implement run-token cancellation**

Increment `runToken` on every successful `start()` and every `stop()`. Pass the
captured token into `loop()`. Check `isRunning`, resource presence, and token
equality before inference, after inference/error, and before scheduling RAF.
Change the cancellation condition to `this.rafId !== null`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: all lifecycle regression tests pass.

### Task 4: Pin runtime assets and update documentation

**Files:**
- Modify: `src/SkeletonManager.ts:43-47`
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: final lifecycle behavior.
- Produces: accurate public and agent-facing lifecycle documentation.

- [ ] **Step 1: Assert the pinned asset URL**

Add a test that captures detector config and expects:

```text
https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test`

Expected: FAIL because the current URL is unversioned.

- [ ] **Step 3: Pin the URL and update docs**

Update the source URL. Document initialization guards, owned-camera cleanup,
stale-inference cancellation, 33 world landmarks in metres, and the remaining
absence of multi-pose support.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits successfully with no test failures or TypeScript
errors.
