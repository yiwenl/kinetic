import {
  FilesetResolver,
  PoseLandmarker,
  type PoseLandmarkerOptions,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { CameraManager } from 'camera-manager';
import {
  toCompatibilityPoses,
  type CompatibilityPose,
} from './poseCompatibility';

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

const MODEL_URLS: Record<NonNullable<SkeletonManagerOptions['modelType']>, string> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
};

type VisionFileset = Awaited<
  ReturnType<typeof FilesetResolver.forVisionTasks>
>;

interface PoseInitializationContext {
  generation: number;
  cameraManager: CameraManager;
  ownsCamera: boolean;
  model: PoseLandmarker | null;
  state: 'pending' | 'committed' | 'released';
}

export interface SkeletonManagerOptions {
  modelType?: 'lite' | 'full' | 'heavy';
  mirror?: boolean;
}

export interface SkeletonDetectedEventDetail {
  poses: CompatibilityPose[];
  result: PoseLandmarkerResult;
}

export interface SkeletonErrorEventDetail {
  error: unknown;
}

export interface SkeletonManagerEventMap {
  'skeleton-detected': CustomEvent<SkeletonDetectedEventDetail>;
  error: CustomEvent<SkeletonErrorEventDetail>;
}

export class SkeletonManager extends EventTarget {
  static readonly EVENTS = {
    SKELETON_DETECTED: 'skeleton-detected',
    ERROR: 'error',
  } as const;

  private model: PoseLandmarker | null = null;
  private cameraManager: CameraManager | null = null;
  private rafId: number | null = null;
  private isRunning = false;
  private initializationGeneration = 0;
  private pendingInitialization: PoseInitializationContext | null = null;
  private ownsCamera = false;
  private runToken = 0;
  private lastVideoTime: number | null = null;
  private readonly options: Required<SkeletonManagerOptions>;
  private poses: CompatibilityPose[] = [];

  constructor(options: SkeletonManagerOptions = {}) {
    super();
    this.options = {
      modelType: options.modelType ?? 'full',
      mirror: options.mirror ?? true,
    };
  }

  addEventListener<K extends keyof SkeletonManagerEventMap>(
    type: K,
    listener: (
      this: SkeletonManager,
      event: SkeletonManagerEventMap[K],
    ) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: unknown,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(
      type,
      listener as EventListenerOrEventListenerObject | null,
      options,
    );
  }

  protected createCameraManager(): CameraManager {
    return new CameraManager();
  }

  protected resolveVisionFileset(wasmUrl: string): Promise<VisionFileset> {
    return FilesetResolver.forVisionTasks(wasmUrl);
  }

  protected createPoseLandmarker(
    fileset: VisionFileset,
    options: PoseLandmarkerOptions,
  ): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(fileset, options);
  }

  async init(cameraManager?: CameraManager): Promise<void> {
    if (this.pendingInitialization) {
      throw new Error('SkeletonManager initialization is already in progress.');
    }
    if (this.cameraManager || this.model) {
      throw new Error(
        'SkeletonManager is already initialized. Call dispose() before initializing again.',
      );
    }

    const initializationGeneration = ++this.initializationGeneration;
    const ownsCamera = cameraManager === undefined;
    const nextCameraManager = cameraManager ?? this.createCameraManager();
    const context: PoseInitializationContext = {
      generation: initializationGeneration,
      cameraManager: nextCameraManager,
      ownsCamera,
      model: null,
      state: 'pending',
    };
    this.pendingInitialization = context;

    try {
      if (ownsCamera) {
        await nextCameraManager.start();
        if (context.state !== 'pending') {
          nextCameraManager.dispose();
        }
        this.assertInitializationActive(initializationGeneration);
      }

      const fileset = await this.resolveVisionFileset(WASM_URL);
      this.assertInitializationActive(initializationGeneration);
      const nextModel = await this.createPoseLandmarker(fileset, {
        baseOptions: { modelAssetPath: MODEL_URLS[this.options.modelType] },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      if (context.state !== 'pending') {
        nextModel.close();
        this.assertInitializationActive(initializationGeneration);
      }
      context.model = nextModel;
      this.assertInitializationActive(initializationGeneration);

      context.state = 'committed';
      this.pendingInitialization = null;
      this.cameraManager = nextCameraManager;
      this.model = nextModel;
      this.ownsCamera = ownsCamera;
      this.start();
      this.assertInitializationActive(initializationGeneration);
    } catch (error) {
      if (context.state === 'pending') {
        this.releasePendingInitialization(context);
      } else if (context.state === 'committed' && this.model === context.model) {
        this.stop();
        context.model?.close();
        if (context.ownsCamera) {
          context.cameraManager.dispose();
        }
        this.model = null;
        this.cameraManager = null;
        this.ownsCamera = false;
        this.poses = [];
        context.state = 'released';
      }
      throw error;
    }
  }

  private assertInitializationActive(initializationGeneration: number): void {
    if (initializationGeneration !== this.initializationGeneration) {
      throw new Error('SkeletonManager initialization was cancelled by dispose().');
    }
  }

  private releasePendingInitialization(
    context: PoseInitializationContext,
  ): void {
    if (context.state !== 'pending') return;
    context.state = 'released';
    context.model?.close();
    context.model = null;
    if (context.ownsCamera) {
      context.cameraManager.dispose();
    }
    if (this.pendingInitialization === context) {
      this.pendingInitialization = null;
    }
  }

  start(): void {
    if (this.isRunning || !this.cameraManager || !this.model) return;
    this.isRunning = true;
    this.lastVideoTime = null;
    const runToken = ++this.runToken;
    this.loop(runToken);
  }

  stop(): void {
    this.isRunning = false;
    this.runToken += 1;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  dispose(): void {
    this.initializationGeneration += 1;
    if (this.pendingInitialization) {
      this.releasePendingInitialization(this.pendingInitialization);
    }
    this.stop();
    this.model?.close();
    this.model = null;
    if (this.cameraManager && this.ownsCamera) {
      this.cameraManager.dispose();
    }
    this.cameraManager = null;
    this.ownsCamera = false;
    this.lastVideoTime = null;
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

  private loop(runToken: number): void {
    if (!this.isActiveRun(runToken)) return;

    const cameraManager = this.cameraManager;
    const model = this.model;
    if (!cameraManager || !model) return;

    const video = cameraManager.video;
    if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;
      try {
        const result: PoseLandmarkerResult = model.detectForVideo(
          video,
          performance.now(),
        );
        if (!this.isActiveRun(runToken)) return;

        const poses = toCompatibilityPoses(
          result,
          video.videoWidth,
          video.videoHeight,
          this.options.mirror,
        );
        this.poses = poses;
        this.dispatchEvent(
          new CustomEvent(SkeletonManager.EVENTS.SKELETON_DETECTED, {
            detail: { poses, result },
          }),
        );
      } catch (error) {
        if (!this.isActiveRun(runToken)) return;
        console.error('Skeleton detection error:', error);
        this.dispatchEvent(
          new CustomEvent(SkeletonManager.EVENTS.ERROR, {
            detail: { error },
          }),
        );
      }
    }

    if (!this.isActiveRun(runToken)) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.loop(runToken);
    });
  }

  getVertices(): number[][] {
    const keypoints = this.poses[0]?.keypoints3D;
    if (!keypoints) return [];
    return keypoints.map(({ x, y, z }) => [x, y, z]);
  }

  getPoseCount(): number {
    return this.poses.length;
  }

  get video(): HTMLVideoElement | null {
    return this.cameraManager?.video ?? null;
  }
}
