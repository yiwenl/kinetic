# Kinetic

A lightweight Skeleton Tracking / Pose Detection module using TensorFlow.js and MediaPipe (BlazePose), capable of detecting full body poses and providing 3D vertex positions.

## Features

- **Pose Detection**: Real-time full body pose detection using MediaPipe BlazePose.
- **3D Landmarks**: specialized in providing the array of 3D vertices for the detected pose.
- **Mirroring**: Optional horizontal flipping of detection results (enabled by default).
- **Camera Management**: Built-in camera access handling via `camera-manager`.
- **Easy Integration**: Modular design with TypeScript support.
- **Bundled Dependencies**: No need to manage external TensorFlow.js scripts manually.

## Installation

```bash
npm install kinetic
```

(Note: If this is a private package, adjust installation instructions accordingly)

## Usage

```typescript
import { CameraManager, SkeletonManager } from 'kinetic';

// 1. Initialize Camera
const cameraManager = new CameraManager();
await cameraManager.start();
document.body.appendChild(cameraManager.video);

// 2. Initialize Skeleton Manager
const skeletonManager = new SkeletonManager({
    modelType: 'full', // 'lite', 'full', or 'heavy'
    mirror: true       // Mirror results (and flip camera) if desired. Default: true.
});

// 3. Listen for Results
skeletonManager.addEventListener('skeleton-detected', (e) => {
    // e.detail.poses is Array<poseDetection.Pose>
    const poses = e.detail.poses;
    const poseCount = skeletonManager.getPoseCount();
    
    // Get 3D vertices for the first pose (format: [[x, y, z], ...])
    const vertices = skeletonManager.getVertices();

    console.log(`Detected ${poseCount} pose(s)`);
    if (vertices.length > 0) {
        console.log('Nose vertex:', vertices[0]); // Typical BlazePose ordering
    }
});

// 4. Start
await skeletonManager.init(cameraManager);
```

## Build

To build the project locally:

```bash
npm install
npm run build
```

## Demo

This project includes a demo to verify functionality and visualize results in 2D.

### Running the Demo
To run the demo locally:

```bash
npm install
npm run build
npm run test:build
npm start
```

Then open the URL provided (e.g., [http://localhost:3000](http://localhost:3000)).

## License

ISC
