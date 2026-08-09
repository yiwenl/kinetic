import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

globalThis.require = createRequire(import.meta.url);

const kinetic = await import('../dist/kinetic.esm.js');

const expectedNames = [
  'nose',
  'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear', 'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
  'left_index', 'right_index', 'left_thumb', 'right_thumb',
  'left_hip', 'right_hip', 'left_knee', 'right_knee',
  'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

function createResult() {
  return {
    landmarks: [Array.from({ length: 33 }, (_, index) => ({
      x: index === 0 ? 0.25 : index / 100,
      y: index === 0 ? 0.5 : index / 100,
      z: index === 0 ? -0.125 : index / 1000,
      visibility: index === 0 ? 0.8 : 0.4,
      presence: 0.9,
    }))],
    worldLandmarks: [Array.from({ length: 33 }, (_, index) => ({
      x: index === 0 ? 0.1 : index / 100,
      y: index === 0 ? -0.2 : index / 100,
      z: index === 0 ? 0.3 : index / 100,
      visibility: index === 0 ? 0.7 : 0.5,
      presence: 0.9,
    }))],
    segmentationMasks: [],
  };
}

test('converts all 33 native pose landmarks to pixel and metre compatibility coordinates', () => {
  assert.equal(typeof kinetic.toCompatibilityPoses, 'function');

  const [pose] = kinetic.toCompatibilityPoses(createResult(), 640, 480, false);

  assert.equal(pose.keypoints.length, 33);
  assert.equal(pose.keypoints3D.length, 33);
  assert.deepEqual(pose.keypoints.map(({ name }) => name), expectedNames);
  assert.deepEqual(pose.keypoints3D.map(({ name }) => name), expectedNames);
  assert.deepEqual(pose.keypoints[0], {
    x: 160,
    y: 240,
    z: -0.125,
    score: 0.8,
    name: 'nose',
  });
  assert.deepEqual(pose.keypoints3D[0], {
    x: 0.1,
    y: -0.2,
    z: 0.3,
    score: 0.7,
    name: 'nose',
  });
  assert.ok(Math.abs(pose.score - (0.8 + 32 * 0.4) / 33) < 1e-12);
});

test('mirrors compatibility image and world X without changing Y or Z', () => {
  const result = createResult();
  const [pose] = kinetic.toCompatibilityPoses(result, 640, 480, true);

  assert.deepEqual(pose.keypoints[0], {
    x: 480,
    y: 240,
    z: -0.125,
    score: 0.8,
    name: 'nose',
  });
  assert.deepEqual(pose.keypoints3D[0], {
    x: -0.1,
    y: -0.2,
    z: 0.3,
    score: 0.7,
    name: 'nose',
  });
  assert.equal(result.landmarks[0][0].x, 0.25);
  assert.equal(result.worldLandmarks[0][0].x, 0.1);
});

test('returns no pose for empty or incomplete native landmark pairs', () => {
  assert.deepEqual(
    kinetic.toCompatibilityPoses({ landmarks: [], worldLandmarks: [] }, 640, 480, false),
    [],
  );
  assert.deepEqual(
    kinetic.toCompatibilityPoses({ landmarks: [[{ x: 0, y: 0, z: 0 }]], worldLandmarks: [] }, 640, 480, false),
    [],
  );
  assert.deepEqual(
    kinetic.toCompatibilityPoses({
      landmarks: [Array.from({ length: 32 }, () => ({ x: 0, y: 0, z: 0 }))],
      worldLandmarks: [Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }))],
    }, 640, 480, false),
    [],
  );
});
