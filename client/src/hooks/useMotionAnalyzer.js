import { useEffect, useRef, useState } from 'react';

export function useMotionAnalyzer({ videoRef, enabled, threshold = 55, onTrigger }) {
  const [motionScore, setMotionScore] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);

  const canvasRef = useRef(null);
  const prevFrameRef = useRef(null);
  const intervalRef = useRef(null);
  const consecutiveRef = useRef(0);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      prevFrameRef.current = null;
      setIsActive(false);
      setMotionScore(0);
    };

    if (!enabled) {
      cleanup();
      return cleanup;
    }

    const videoEl = videoRef?.current;
    if (!videoEl) {
      return cleanup;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return cleanup;
      }

      canvasRef.current = canvas;

      intervalRef.current = setInterval(() => {
        if (!videoEl.videoWidth || !videoEl.videoHeight) {
          return;
        }

        try {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

          if (!prevFrameRef.current) {
            prevFrameRef.current = new Uint8ClampedArray(imageData);
            return;
          }

          const previous = prevFrameRef.current;
          const pixelCount = canvas.width * canvas.height;
          let changedPixels = 0;

          for (let i = 0; i < imageData.length; i += 4) {
            const dr = Math.abs(imageData[i] - previous[i]);
            const dg = Math.abs(imageData[i + 1] - previous[i + 1]);
            const db = Math.abs(imageData[i + 2] - previous[i + 2]);

            if (dr > 30 || dg > 30 || db > 30) {
              changedPixels += 1;
            }
          }

          const nextScore = Number(((changedPixels / pixelCount) * 100).toFixed(2));
          setMotionScore(nextScore);
          prevFrameRef.current = new Uint8ClampedArray(imageData);

          if (nextScore >= threshold) {
            consecutiveRef.current += 1;
          } else {
            consecutiveRef.current = 0;
          }

          const now = Date.now();
          const cooldownMs = 30_000;

          if (consecutiveRef.current >= 2 && now - lastTriggerAtRef.current > cooldownMs) {
            lastTriggerAtRef.current = now;
            setIsTriggered(true);
            onTrigger?.();
            setTimeout(() => setIsTriggered(false), 1000);
          }
        } catch (_error) {
          // Frame capture can fail for cross-origin embeds.
        }
      }, 500);

      setIsActive(true);
    } catch (_error) {
      cleanup();
    }

    return cleanup;
  }, [enabled, onTrigger, threshold, videoRef]);

  return {
    motionScore,
    isActive,
    isTriggered,
  };
}
