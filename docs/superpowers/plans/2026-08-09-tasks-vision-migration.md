# Kinetic Tasks Vision Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TensorFlow.js pose wrapper with MediaPipe Tasks Vision 1.0.1 while preserving Kinetic's lifecycle, mirror behavior, and 3D world-coordinate API, and add native results to events.

**Architecture:** `SkeletonManager` retains ownership, initialization, run-token, and scheduling responsibilities. A pure `poseCompatibility` module converts native normalized/image and metre/world landmarks into the established Pose-like shape; the untouched native result is emitted separately.

**Tech Stack:** TypeScript, MediaPipe Tasks Vision 1.0.1, camera-manager, Rollup, Node test runner, Vite.

## Global Constraints

- Preserve the public class, options, methods, video property, and event names.
- Use `@mediapipe/tasks-vision` exactly `1.0.1` and pin its CDN WASM path to that version.
- Map `lite`, `full`, and `heavy` to versioned official float16 Pose Landmarker models.
- Compatibility `keypoints3D` and `getVertices()` remain world-space 3D coordinates in metres.
- Emit the untouched, normalized/unmirrored native result at `event.detail.result`.
- Keep detection synchronous on the browser thread; worker offloading is out of scope.

---

### Task 1: Pose compatibility conversion contract

**Files:**
- Create: `src/poseCompatibility.ts`
- Create: `test/poseCompatibility.test.js`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: native `PoseLandmarkerResult.landmarks`, `.worldLandmarks`, video dimensions, and mirror flag.
- Produces: `toCompatibilityPoses(result, width, height, mirror): CompatibilityPose[]` with 33 named image keypoints, 33 named metre-space `keypoints3D`, and average available landmark visibility as pose `score`.

- [ ] **Step 1: Write failing adapter tests** with literal fixtures for pixel conversion, relative Z, metre preservation, visibility-to-score mapping, all 33 established names, average pose score, mirror image/world X, and empty/mismatched results.
- [ ] **Step 2: Run the focused test and verify failure is due to the missing adapter.**
- [ ] **Step 3: Implement typed compatibility interfaces, the fixed BlazePose name array, deterministic average visibility, and pairwise pose conversion.**
- [ ] **Step 4: Export compatibility types from `src/index.ts`, run `npm run build && node --test test/poseCompatibility.test.js`, and verify green.**

### Task 2: Tasks Vision manager and model mapping

**Files:**
- Modify: `src/SkeletonManager.ts`
- Modify: `test/SkeletonManager.test.js`

**Interfaces:**
- Consumes: `FilesetResolver.forVisionTasks(WASM_URL)` and `PoseLandmarker.createFromOptions(fileset, options)`.
- Produces: unchanged `skeleton-detected` event plus `{ poses, result }`; protected runtime/landmarker creation hooks.

- [ ] **Step 1: Rewrite/add failing tests** for the pinned WASM URL; literal `lite`, `full`, and `heavy` model URLs; `VIDEO` running mode; native-result identity; compatibility output; one inference per new `video.currentTime`; and error events.
- [ ] **Step 2: Run tests and confirm failure is caused by the old wrapper configuration and result shape.**
- [ ] **Step 3: Replace TensorFlow imports/hooks** with Tasks Vision, configure `numPoses: 1`, invoke synchronous `detectForVideo(video, performance.now())`, convert the result, and dispatch `{ poses, result }`.
- [ ] **Step 4: Deduplicate unchanged frames** and reset frame state on start/dispose.
- [ ] **Step 5: Run `npm run build && node --test test/*.test.js`** and verify manager/adapter behavior is green.

### Task 3: Preserve lifecycle and disposal guarantees

**Files:**
- Modify: `src/SkeletonManager.ts`
- Modify: `test/SkeletonManager.test.js`

- [ ] **Step 1: Adjust existing lifecycle tests** to use a complete fake Tasks landmarker with synchronous `detectForVideo()` and `close()` while retaining ownership, failed/repeated/concurrent init, start-before-init, RAF-zero, stop, and stale callback coverage.
- [ ] **Step 2: Run tests and verify failures expose any old `dispose()` or async-estimation assumptions.**
- [ ] **Step 3: Preserve the current lifecycle state machine**, replacing detector disposal with `close()` and ensuring callbacks check the run token before processing.
- [ ] **Step 4: Verify `getVertices()` returns the first mirrored compatibility pose's 33 `[x,y,z]` world points in metres.**
- [ ] **Step 5: Run the full test suite and confirm green.**

### Task 4: Dependencies, bundle, and documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `rollup.config.js`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Install `@mediapipe/tasks-vision@1.0.1` without lifecycle scripts and remove the TensorFlow pose packages plus `gl-matrix`.**
- [ ] **Step 2: Keep Rollup self-contained and confirm no old external/global declarations remain.**
- [ ] **Step 3: Update README and CLAUDE.md** with `{ poses, result }`, native normalized versus compatibility pixel coordinates, native/world metres, 3D guarantees, model mapping, pinned assets, synchronous inference, mirroring, and camera ownership.
- [ ] **Step 4: Run `npm test`, `npm run build`, and `npx tsc --noEmit`; inspect ESM/UMD artifacts for old TensorFlow imports.**
- [ ] **Step 5: Run the Vite demo in a browser** and verify all 33 skeleton points, mirror behavior, metre-space data, and a clean console.

