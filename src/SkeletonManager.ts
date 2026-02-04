import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { CameraManager } from 'camera-manager';

export interface SkeletonManagerOptions {
  modelType?: 'lite' | 'full' | 'heavy';
  mirror?: boolean;
}

export class SkeletonManager extends EventTarget {
  private model: poseDetection.PoseDetector | null = null;
  private cameraManager: CameraManager | null = null;
  private rafId: number | null = null;
  private isRunning: boolean = false;
  private options: SkeletonManagerOptions;
  
  // Store latest results
  private poses: poseDetection.Pose[] = [];

  constructor(options: SkeletonManagerOptions = {}) {
    super();
    this.options = {
      modelType: options.modelType || 'full',
      mirror: options.mirror === undefined ? true : options.mirror
    };
  }

  async init(cameraManager: CameraManager) {
    this.cameraManager = cameraManager;

    const model = poseDetection.SupportedModels.BlazePose;
    const detectorConfig: poseDetection.BlazePoseMediaPipeModelConfig = {
      runtime: 'mediapipe',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose',
      modelType: this.options.modelType
    };
    
    await tf.ready();

    this.model = await poseDetection.createDetector(model, detectorConfig);

    this.start();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.stop();
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.cameraManager = null;
    this.poses = [];
  }

  private async loop() {
    if (!this.isRunning || !this.cameraManager || !this.model) return;

    const video = this.cameraManager.video;
    
    if (video.readyState >= 2) {
        try {
            const poses = await this.model.estimatePoses(video, {
                flipHorizontal: this.options.mirror
            });
            this.poses = poses;
            
            this.dispatchEvent(new CustomEvent('skeleton-detected', { detail: { poses } }));
        } catch (err) {
            console.error('Skeleton detection error:', err);
            this.dispatchEvent(new CustomEvent('error', { detail: { error: err } }));
        }
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  /**
   * Returns array of vertices positions in 3D for the first detected pose.
   * Format: [[x, y, z], ...]
   */
  getVertices(): number[][] {
    if (this.poses.length > 0 && this.poses[0].keypoints3D) {
      return this.poses[0].keypoints3D.map(kp => [kp.x, kp.y, kp.z || 0]);
    }
    return [];
  }

  /**
   * Returns number of poses detected
   */
  getPoseCount(): number {
    return this.poses.length;
  }
}
