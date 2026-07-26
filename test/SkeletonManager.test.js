import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

globalThis.require = createRequire(import.meta.url);

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

class FakeCamera {
  constructor() {
    this.startCount = 0;
    this.stopCount = 0;
    this.disposeCount = 0;
    this.video = { readyState: 2 };
  }

  async start() {
    this.startCount += 1;
  }

  stop() {
    this.stopCount += 1;
  }

  dispose() {
    this.disposeCount += 1;
  }
}

function createDetector({ estimatePoses } = {}) {
  return {
    disposeCount: 0,
    estimateCount: 0,
    dispose() {
      this.disposeCount += 1;
    },
    async estimatePoses(...args) {
      this.estimateCount += 1;
      if (estimatePoses) {
        return estimatePoses(...args);
      }
      return [];
    },
  };
}

class TestSkeletonManager extends SkeletonManager {
  constructor({
    camera = new FakeCamera(),
    detector = createDetector(),
    detectorFactory,
    readyTensorFlow,
  } = {}) {
    super({ mirror: false });
    this.fakeCamera = camera;
    this.fakeDetector = detector;
    this.detectorFactory =
      detectorFactory ?? (async () => this.fakeDetector);
    this.tensorFlowReady = readyTensorFlow ?? (async () => {});
    this.detectorConfig = null;
  }

  createCameraManager() {
    return this.fakeCamera;
  }

  async readyTensorFlow() {
    await this.tensorFlowReady();
  }

  async createPoseDetector(config) {
    this.detectorConfig = config;
    return this.detectorFactory(config);
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

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createPose(firstX) {
  const keypoints = Array.from({ length: 33 }, (_, index) => ({
    x: firstX + index,
    y: 100 + index,
    z: index / 100,
    score: 0.99,
    name: `point_${index}`,
  }));

  return {
    score: 0.99,
    keypoints,
    keypoints3D: keypoints,
  };
}

test.beforeEach(() => {
  animationFrames.clear();
  nextRafId = 1;
});

test('initialization uses replaceable runtime boundaries', async () => {
  const camera = new FakeCamera();
  const manager = new TestSkeletonManager({ camera });

  await manager.init();

  assert.equal(camera.startCount, 1);
  assert.equal(manager.video, camera.video);
  assert.equal(manager.getPoseCount(), 0);

  manager.dispose();
});

test('dispose releases a camera created by the manager', async () => {
  const camera = new FakeCamera();
  const manager = new TestSkeletonManager({ camera });

  await manager.init();
  manager.dispose();

  assert.equal(camera.disposeCount, 1);
  assert.equal(manager.video, null);
});

test('dispose preserves a caller-provided camera', async () => {
  const camera = new FakeCamera();
  const manager = new TestSkeletonManager();

  await manager.init(camera);
  manager.dispose();

  assert.equal(camera.stopCount, 0);
  assert.equal(camera.disposeCount, 0);
  assert.equal(manager.video, null);
});

test('failed initialization releases its internally created camera', async () => {
  const camera = new FakeCamera();
  const initializationError = new Error('detector failed');
  const manager = new TestSkeletonManager({
    camera,
    detectorFactory: async () => {
      throw initializationError;
    },
  });

  await assert.rejects(manager.init(), initializationError);

  assert.equal(camera.disposeCount, 1);
  assert.equal(manager.video, null);
});

test('repeated initialization is rejected until dispose', async () => {
  const manager = new TestSkeletonManager();

  await manager.init();

  await assert.rejects(
    manager.init(),
    /already initialized/i,
  );

  manager.dispose();
  await manager.init();
  manager.dispose();
});

test('concurrent initialization is rejected', async () => {
  const detector = createDetector();
  const firstDetector = deferred();
  let detectorCreationCount = 0;
  const manager = new TestSkeletonManager({
    detector,
    detectorFactory: async () => {
      detectorCreationCount += 1;
      if (detectorCreationCount === 1) {
        return firstDetector.promise;
      }
      return detector;
    },
  });

  const firstInitialization = manager.init();
  await flushMicrotasks();

  await assert.rejects(
    manager.init(),
    /initialization.*progress/i,
  );

  firstDetector.resolve(detector);
  await firstInitialization;
  manager.dispose();
});

test('start before init does not prevent initialization from starting', async () => {
  const detector = createDetector();
  const manager = new TestSkeletonManager({ detector });

  manager.start();
  await manager.init();
  await flushMicrotasks();

  assert.equal(detector.estimateCount, 1);

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

test('stop ignores an inference result that is still in flight', async () => {
  const inference = deferred();
  const detector = createDetector({
    estimatePoses: () => inference.promise,
  });
  const manager = new TestSkeletonManager({ detector });
  let eventCount = 0;
  manager.addEventListener(
    SkeletonManager.EVENTS.SKELETON_DETECTED,
    () => {
      eventCount += 1;
    },
  );

  await manager.init();
  manager.stop();
  inference.resolve([createPose(10)]);
  await flushMicrotasks();

  assert.equal(manager.getPoseCount(), 0);
  assert.equal(eventCount, 0);

  manager.dispose();
});

test('a previous run cannot overwrite results from a later run', async () => {
  const firstInference = deferred();
  const secondInference = deferred();
  const inferenceQueue = [firstInference, secondInference];
  const detector = createDetector({
    estimatePoses: () => inferenceQueue.shift().promise,
  });
  const manager = new TestSkeletonManager({ detector });
  let eventCount = 0;
  manager.addEventListener(
    SkeletonManager.EVENTS.SKELETON_DETECTED,
    () => {
      eventCount += 1;
    },
  );

  await manager.init();
  manager.stop();
  manager.start();

  secondInference.resolve([createPose(20)]);
  await flushMicrotasks();

  assert.deepEqual(manager.getVertices()[0], [20, 100, 0]);
  assert.equal(eventCount, 1);

  firstInference.resolve([createPose(10)]);
  await flushMicrotasks();

  assert.deepEqual(manager.getVertices()[0], [20, 100, 0]);
  assert.equal(eventCount, 1);

  manager.dispose();
});

test('initialization pins MediaPipe Pose assets to the installed version', async () => {
  const manager = new TestSkeletonManager();

  await manager.init();

  assert.equal(
    manager.detectorConfig.solutionPath,
    'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404',
  );

  manager.dispose();
});
