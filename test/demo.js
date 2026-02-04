import { SkeletonManager } from '../src/index.ts';

const statusEl = document.getElementById('status');
const poseCountEl = document.getElementById('pose-count');
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

(async () => {
    try {
        statusEl.textContent = "Loading model...";
        const options = { modelType: 'lite', mirror: true };
        const manager = new SkeletonManager(options);

        statusEl.textContent = "Starting camera...";
        await manager.init(); // Auto-creates camera manager

        // Append camera video to body (using new getter)
        if (manager.video) {
            document.body.appendChild(manager.video);
        }
        // Move canvas to front
        document.body.appendChild(canvas);

        // Mirror video if needed
        if (options.mirror !== false && manager.video) {
            manager.video.style.transform = 'scaleX(-1)';
        }
        
        // Resize canvas to match video
        const resize = () => {
            if (!manager.video) return;
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            manager.video.style.width = '100%';
            manager.video.style.height = '100%';
        };
        window.addEventListener('resize', resize);
        resize();
        
        manager.addEventListener('skeleton-detected', (e) => {
            const poses = e.detail.poses;
            poseCountEl.textContent = poses.length;
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (poses.length > 0) {
                statusEl.textContent = "Tracking";
                
                // Scale factors
                const videoWidth = camera.video.videoWidth;
                const videoHeight = camera.video.videoHeight;
                const scaleX = canvas.width / videoWidth;
                const scaleY = canvas.height / videoHeight;
                
                // Use cover sizing logic to match object-fit: cover
                const scale = Math.max(scaleX, scaleY);
                const scaledWidth = videoWidth * scale;
                const scaledHeight = videoHeight * scale;
                const offsetX = (canvas.width - scaledWidth) / 2;
                const offsetY = (canvas.height - scaledHeight) / 2;

                poses.forEach(pose => {
                    // Draw keypoints
                    pose.keypoints.forEach(kp => {
                        if (kp.score > 0.3) {
                            const x = kp.x * scale + offsetX;
                            const y = kp.y * scale + offsetY;
                            
                            ctx.beginPath();
                            ctx.arc(x, y, 5, 0, Math.PI * 2);
                            ctx.fillStyle = 'red';
                            ctx.fill();
                        }
                    });
                });

            } else {
                statusEl.textContent = "No pose detected";
            }
        });

        statusEl.textContent = "Running";

    } catch (e) {
        console.error(e);
        statusEl.textContent = "Error: " + e.message;
    }
})();
