export const POSE_LANDMARK_NAMES = [
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
] as const;

export interface NativePoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface NativePoseLandmarkerResult {
  landmarks: NativePoseLandmark[][];
  worldLandmarks: NativePoseLandmark[][];
}

export interface CompatibilityPoseKeypoint {
  x: number;
  y: number;
  z: number;
  score?: number;
  name: string;
}

export interface CompatibilityPose {
  score?: number;
  keypoints: CompatibilityPoseKeypoint[];
  keypoints3D: CompatibilityPoseKeypoint[];
}

function averageVisibility(landmarks: NativePoseLandmark[]): number | undefined {
  const values = landmarks
    .map(({ visibility }) => visibility)
    .filter((visibility): visibility is number => visibility !== undefined);

  if (values.length === 0) return undefined;
  return values.reduce((sum, visibility) => sum + visibility, 0) / values.length;
}

export function toCompatibilityPoses(
  result: NativePoseLandmarkerResult,
  videoWidth: number,
  videoHeight: number,
  mirror: boolean,
): CompatibilityPose[] {
  const poses: CompatibilityPose[] = [];

  for (let poseIndex = 0; poseIndex < result.landmarks.length; poseIndex += 1) {
    const landmarks = result.landmarks[poseIndex];
    const worldLandmarks = result.worldLandmarks[poseIndex];
    if (
      landmarks.length < POSE_LANDMARK_NAMES.length ||
      !worldLandmarks ||
      worldLandmarks.length < POSE_LANDMARK_NAMES.length
    ) {
      continue;
    }

    const keypoints = POSE_LANDMARK_NAMES.map((name, index) => {
      const landmark = landmarks[index];
      const x = landmark.x * videoWidth;
      return {
        x: mirror ? videoWidth - x : x,
        y: landmark.y * videoHeight,
        z: landmark.z,
        score: landmark.visibility,
        name,
      };
    });

    const keypoints3D = POSE_LANDMARK_NAMES.map((name, index) => {
      const landmark = worldLandmarks[index];
      return {
        x: mirror ? -landmark.x : landmark.x,
        y: landmark.y,
        z: landmark.z,
        score: landmark.visibility,
        name,
      };
    });

    poses.push({
      score: averageVisibility(landmarks),
      keypoints,
      keypoints3D,
    });
  }

  return poses;
}
