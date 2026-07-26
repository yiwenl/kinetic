import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { CameraManager } from 'camera-manager';

export interface SkeletonManagerOptions {
  modelType?: 'lite' | 'full' | 'heavy';
  mirror?: boolean;
}

export class SkeletonManager extends EventTarget {
  static readonly EVENTS = {
    SKELETON_DETECTED: 'skeleton-detected',
    ERROR: 'error'
  } as const;

  private model: poseDetection.PoseDetector | null = null;
  private cameraManager: CameraManager | null = null;
  private rafId: number | null = null;
  private isRunning: boolean = false;
  private isInitializing: boolean = false;
  private ownsCamera: boolean = false;
  private runToken: number = 0;
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

  protected createCameraManager(): CameraManager {
    return new CameraManager();
  }

  protected readyTensorFlow(): Promise<void> {
    return tf.ready();
  }

  protected createPoseDetector(
    config: poseDetection.BlazePoseMediaPipeModelConfig
  ): Promise<poseDetection.PoseDetector> {
    return poseDetection.createDetector(
      poseDetection.SupportedModels.BlazePose,
      config
    );
  }

  async init(cameraManager?: CameraManager): Promise<void> {
    if (this.isInitializing) {
      throw new Error('SkeletonManager initialization is already in progress.');
    }

    if (this.cameraManager || this.model) {
      throw new Error(
        'SkeletonManager is already initialized. Call dispose() before initializing again.'
      );
    }

    this.isInitializing = true;
    const ownsCamera = cameraManager === undefined;
    const nextCameraManager = cameraManager ?? this.createCameraManager();
    let nextModel: poseDetection.PoseDetector | null = null;

    try {
      if (ownsCamera) {
        await nextCameraManager.start();
      }

      const detectorConfig: poseDetection.BlazePoseMediaPipeModelConfig = {
        runtime: 'mediapipe',
        solutionPath:
          'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404',
        modelType: this.options.modelType
      };

      await this.readyTensorFlow();

      nextModel = await this.createPoseDetector(detectorConfig);
      this.cameraManager = nextCameraManager;
      this.model = nextModel;
      this.ownsCamera = ownsCamera;

      this.start();
    } catch (error) {
      nextModel?.dispose();
      if (ownsCamera) {
        nextCameraManager.dispose();
      }
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  start() {
    if (this.isRunning || !this.cameraManager || !this.model) return;
    this.isRunning = true;
    const runToken = ++this.runToken;
    void this.loop(runToken);
  }

  stop() {
    this.isRunning = false;
    this.runToken += 1;
    if (this.rafId !== null) {
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
    if (this.cameraManager && this.ownsCamera) {
      this.cameraManager.dispose();
    }
    this.cameraManager = null;
    this.ownsCamera = false;
    this.poses = [];
  }

  private isActiveRun(runToken: number): boolean {
    return (
      this.isRunning &&
      this.runToken === runToken &&
      this.cameraManager !== null &&
      this.model !== null
    );
  }

  private async loop(runToken: number): Promise<void> {
    if (!this.isActiveRun(runToken)) return;

    const cameraManager = this.cameraManager;
    const model = this.model;
    if (!cameraManager || !model) return;

    const video = cameraManager.video;
    
    if (video.readyState >= 2) {
      try {
        const poses = await model.estimatePoses(video, {
          flipHorizontal: this.options.mirror
        });
        if (!this.isActiveRun(runToken)) return;

        this.poses = poses;

        this.dispatchEvent(
          new CustomEvent(SkeletonManager.EVENTS.SKELETON_DETECTED, {
            detail: { poses }
          })
        );
      } catch (err) {
        if (!this.isActiveRun(runToken)) return;

        console.error('Skeleton detection error:', err);
        this.dispatchEvent(
          new CustomEvent(SkeletonManager.EVENTS.ERROR, {
            detail: { error: err }
          })
        );
      }
    }

    if (!this.isActiveRun(runToken)) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      void this.loop(runToken);
    });
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

  get video(): HTMLVideoElement | null {
    return this.cameraManager ? this.cameraManager.video : null;
  }
}
