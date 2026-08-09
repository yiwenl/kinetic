import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

globalThis.require = createRequire(import.meta.url);

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  };
}

const { SkeletonManager } = await import('../dist/kinetic.esm.js');

let nextRafId = 1;
const animationFrames = new Map();

globalThis.requestAnimationFrame = (callback) => {
  const id = nextRafId++;
  animationFrames.set(id, callback);
  return id;
};

globalThis.cancelAnimationFrame = (id) => {
  animationFrames.delete(id);
};

function runNextAnimationFrame() {
  const entry = animationFrames.entries().next().value;
  assert.ok(entry, 'expected a queued animation frame');
  const [id, callback] = entry;
  animationFrames.delete(id);
  callback(performance.now());
}

class FakeCamera {
  constructor() {
    this.startCount = 0;
    this.stopCount = 0;
    this.disposeCount = 0;
    this.video = {
      readyState: 2,
      currentTime: 1,
      videoWidth: 640,
      videoHeight: 480,
    };
  }

  async start() { this.startCount += 1; }
  stop() { this.stopCount += 1; }
  dispose() { this.disposeCount += 1; }
}

function createNativeResult() {
  return {
    landmarks: [Array.from({ length: 33 }, (_, index) => ({
      x: index === 0 ? 0.25 : index / 100,
      y: index === 0 ? 0.5 : index / 100,
      z: index === 0 ? -0.125 : index / 1000,
      visibility: 0.8,
      presence: 0.9,
    }))],
    worldLandmarks: [Array.from({ length: 33 }, (_, index) => ({
      x: index === 0 ? 0.1 : index / 100,
      y: index === 0 ? -0.2 : index / 100,
      z: index === 0 ? 0.3 : index / 100,
      visibility: 0.7,
      presence: 0.9,
    }))],
    segmentationMasks: [],
    close() {},
  };
}

function createLandmarker({ detectForVideo } = {}) {
  return {
    closeCount: 0,
    detectCount: 0,
    close() { this.closeCount += 1; },
    detectForVideo(...args) {
      this.detectCount += 1;
      return detectForVideo ? detectForVideo(...args) : createNativeResult();
    },
  };
}

class TestSkeletonManager extends SkeletonManager {
  constructor({
    camera = new FakeCamera(),
    landmarker = createLandmarker(),
    landmarkerFactory,
    options = { mirror: false },
  } = {}) {
    super(options);
    this.fakeCamera = camera;
    this.fakeLandmarker = landmarker;
    this.landmarkerFactory = landmarkerFactory ?? (async () => landmarker);
    this.wasmUrl = null;
    this.landmarkerOptions = null;
  }

  createCameraManager() { return this.fakeCamera; }

  async resolveVisionFileset(wasmUrl) {
    this.wasmUrl = wasmUrl;
    return { wasmLoaderPath: 'loader.js', wasmBinaryPath: 'binary.wasm' };
  }

  async createPoseLandmarker(fileset, options) {
    this.landmarkerOptions = options;
    return this.landmarkerFactory(fileset, options);
  }

}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

test.beforeEach(() => {
  animationFrames.clear();
  nextRafId = 1;
});

test('CommonJS bundle exposes the public API', () => {
  const commonJs = globalThis.require('../dist/kinetic.cjs');
  assert.equal(typeof commonJs.SkeletonManager, 'function');
  assert.equal(typeof commonJs.toCompatibilityPoses, 'function');
});

test('initialization uses pinned Tasks Vision WASM and the selected versioned pose model', async () => {
  const expectedModels = {
    lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
    heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  };

  for (const [modelType, modelAssetPath] of Object.entries(expectedModels)) {
    const manager = new TestSkeletonManager({ options: { modelType, mirror: false } });
    await manager.init();

    assert.equal(manager.wasmUrl, 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
    assert.deepEqual(manager.landmarkerOptions, {
      baseOptions: { modelAssetPath },
      runningMode: 'VIDEO',
      numPoses: 1,
    });
    manager.dispose();
  }
});

test('skeleton event exposes mirrored compatibility data and untouched native result', async () => {
  const result = createNativeResult();
  const manager = new TestSkeletonManager({
    landmarker: createLandmarker({ detectForVideo: () => result }),
    options: { mirror: true },
  });
  let detail;
  manager.addEventListener(SkeletonManager.EVENTS.SKELETON_DETECTED, (event) => { detail = event.detail; });

  await manager.init();

  assert.equal(detail.result, result);
  assert.deepEqual(detail.poses[0].keypoints[0], {
    x: 480, y: 240, z: -0.125, score: 0.8, name: 'nose',
  });
  assert.deepEqual(detail.poses[0].keypoints3D[0], {
    x: -0.1, y: -0.2, z: 0.3, score: 0.7, name: 'nose',
  });
  assert.deepEqual(manager.getVertices()[0], [-0.1, -0.2, 0.3]);
  assert.equal(result.landmarks[0][0].x, 0.25);
  assert.equal(result.worldLandmarks[0][0].x, 0.1);
  manager.dispose();
});

test('runs detection only once for each new video frame', async () => {
  const landmarker = createLandmarker();
  const manager = new TestSkeletonManager({ landmarker });

  await manager.init();
  assert.equal(landmarker.detectCount, 1);

  runNextAnimationFrame();
  assert.equal(landmarker.detectCount, 1);

  manager.video.currentTime = 2;
  runNextAnimationFrame();
  assert.equal(landmarker.detectCount, 2);
  manager.dispose();
});

test('continues after an inference error and emits the error detail', async () => {
  let attempt = 0;
  const failure = new Error('temporary failure');
  const manager = new TestSkeletonManager({
    landmarker: createLandmarker({
      detectForVideo: () => {
        attempt += 1;
        if (attempt === 1) throw failure;
        return createNativeResult();
      },
    }),
  });
  let receivedError;
  let resultCount = 0;
  manager.addEventListener(SkeletonManager.EVENTS.ERROR, (event) => { receivedError = event.detail.error; });
  manager.addEventListener(SkeletonManager.EVENTS.SKELETON_DETECTED, () => { resultCount += 1; });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await manager.init();
    manager.video.currentTime = 2;
    runNextAnimationFrame();
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(receivedError, failure);
  assert.equal(resultCount, 1);
  manager.dispose();
});

test('dispose releases an internally created camera and closes the landmarker', async () => {
  const camera = new FakeCamera();
  const landmarker = createLandmarker();
  const manager = new TestSkeletonManager({ camera, landmarker });

  await manager.init();
  manager.dispose();

  assert.equal(camera.startCount, 1);
  assert.equal(camera.disposeCount, 1);
  assert.equal(landmarker.closeCount, 1);
  assert.equal(manager.video, null);
});

test('dispose preserves a caller-provided camera', async () => {
  const camera = new FakeCamera();
  const manager = new TestSkeletonManager();

  await manager.init(camera);
  manager.dispose();

  assert.equal(camera.startCount, 0);
  assert.equal(camera.stopCount, 0);
  assert.equal(camera.disposeCount, 0);
});

test('failed initialization releases its internally created camera', async () => {
  const camera = new FakeCamera();
  const failure = new Error('landmarker failed');
  const manager = new TestSkeletonManager({
    camera,
    landmarkerFactory: async () => { throw failure; },
  });

  await assert.rejects(manager.init(), failure);
  assert.equal(camera.disposeCount, 1);
  assert.equal(manager.video, null);
});

test('dispose cancels pending initialization and releases local resources', async () => {
  const camera = new FakeCamera();
  const landmarker = createLandmarker();
  const pending = deferred();
  const factoryStarted = deferred();
  const manager = new TestSkeletonManager({
    camera,
    landmarker,
    landmarkerFactory: () => {
      factoryStarted.resolve();
      return pending.promise;
    },
  });

  const initialization = manager.init();
  await factoryStarted.promise;
  manager.dispose();
  assert.equal(camera.disposeCount, 1);
  pending.resolve(landmarker);

  await assert.rejects(initialization, /cancelled.*dispose/i);
  assert.equal(camera.disposeCount, 1);
  assert.equal(landmarker.closeCount, 1);
  assert.equal(landmarker.detectCount, 0);
  assert.equal(manager.video, null);
});

test('init rejects when a synchronous result listener disposes the manager', async () => {
  const camera = new FakeCamera();
  const landmarker = createLandmarker();
  const manager = new TestSkeletonManager({ camera, landmarker });
  manager.addEventListener(SkeletonManager.EVENTS.SKELETON_DETECTED, () => {
    manager.dispose();
  });

  await assert.rejects(manager.init(), /cancelled.*dispose/i);

  assert.equal(camera.disposeCount, 1);
  assert.equal(landmarker.closeCount, 1);
  assert.equal(manager.video, null);
});

test('a camera start that resolves after dispose is released again', async () => {
  const camera = new FakeCamera();
  const startPending = deferred();
  const startEntered = deferred();
  camera.active = false;
  camera.start = async () => {
    camera.startCount += 1;
    startEntered.resolve();
    await startPending.promise;
    camera.active = true;
  };
  camera.dispose = () => {
    camera.disposeCount += 1;
    camera.active = false;
  };
  const manager = new TestSkeletonManager({ camera });

  const initialization = manager.init();
  await startEntered.promise;
  manager.dispose();
  assert.equal(camera.active, false);
  startPending.resolve();

  await assert.rejects(initialization, /cancelled.*dispose/i);
  assert.equal(camera.active, false);
  assert.equal(camera.disposeCount, 2);
  assert.equal(manager.video, null);
});

test('can initialize again while a disposed initialization is still pending', async () => {
  const firstCamera = new FakeCamera();
  const secondCamera = new FakeCamera();
  const firstLandmarker = createLandmarker();
  const secondLandmarker = createLandmarker();
  const firstPending = deferred();
  const firstFactoryStarted = deferred();
  const manager = new TestSkeletonManager({
    camera: firstCamera,
    landmarkerFactory: () => {
      firstFactoryStarted.resolve();
      return firstPending.promise;
    },
  });

  const firstInitialization = manager.init();
  await firstFactoryStarted.promise;
  manager.dispose();

  manager.landmarkerFactory = async () => secondLandmarker;
  await manager.init(secondCamera);
  assert.equal(manager.video, secondCamera.video);

  firstPending.resolve(firstLandmarker);
  await assert.rejects(firstInitialization, /cancelled.*dispose/i);
  assert.equal(firstLandmarker.closeCount, 1);
  assert.equal(manager.video, secondCamera.video);

  manager.dispose();
  assert.equal(secondLandmarker.closeCount, 1);
  assert.equal(secondCamera.disposeCount, 0);
});

test('rejects repeated initialization until dispose', async () => {
  const manager = new TestSkeletonManager();

  await manager.init();
  await assert.rejects(manager.init(), /already initialized/i);

  manager.dispose();
  await manager.init();
  manager.dispose();
});

test('rejects concurrent initialization', async () => {
  const pending = deferred();
  const landmarker = createLandmarker();
  const manager = new TestSkeletonManager({
    landmarker,
    landmarkerFactory: () => pending.promise,
  });

  const firstInit = manager.init();
  await Promise.resolve();
  await assert.rejects(manager.init(), /initialization.*progress/i);

  pending.resolve(landmarker);
  await firstInit;
  manager.dispose();
});

test('start before init remains a safe no-op', async () => {
  const landmarker = createLandmarker();
  const manager = new TestSkeletonManager({ landmarker });

  manager.start();
  await manager.init();

  assert.equal(landmarker.detectCount, 1);
  manager.dispose();
});

test('stop cancels requestAnimationFrame identifier zero', async () => {
  const camera = new FakeCamera();
  camera.video.readyState = 0;
  const manager = new TestSkeletonManager({ camera });
  nextRafId = 0;

  await manager.init();
  assert.equal(animationFrames.has(0), true);

  manager.stop();
  assert.equal(animationFrames.has(0), false);
  manager.dispose();
});

test('a stopped run cannot publish a result returned after stop', async () => {
  let manager;
  const landmarker = createLandmarker({
    detectForVideo: () => {
      manager.stop();
      return createNativeResult();
    },
  });
  manager = new TestSkeletonManager({ landmarker });
  let eventCount = 0;
  manager.addEventListener(SkeletonManager.EVENTS.SKELETON_DETECTED, () => { eventCount += 1; });

  await manager.init();

  assert.equal(eventCount, 0);
  assert.equal(manager.getPoseCount(), 0);
  manager.dispose();
});
