import { useEffect, useRef, useState } from 'react';

export function useAudioAnalyzer({ videoRef, enabled, threshold = 65, onTrigger }) {
  const [energy, setEnergy] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isTriggered, setIsTriggered] = useState(false);

  const intervalRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const dataArrayRef = useRef(null);
  const consecutiveRef = useRef(0);
  const lastTriggerAtRef = useRef(0);

  useEffect(() => {
    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      try {
        sourceNodeRef.current?.disconnect();
      } catch (_error) {
        // ignore disconnect errors
      }

      try {
        analyserRef.current?.disconnect();
      } catch (_error) {
        // ignore disconnect errors
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      analyserRef.current = null;
      sourceNodeRef.current = null;
      dataArrayRef.current = null;
      audioContextRef.current = null;
      consecutiveRef.current = 0;
      setIsActive(false);
      setEnergy(0);
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
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return cleanup;
      }

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      let sourceNode;
      if (typeof videoEl.captureStream === 'function') {
        const stream = videoEl.captureStream();
        sourceNode = audioContext.createMediaStreamSource(stream);
      } else {
        sourceNode = audioContext.createMediaElementSource(videoEl);
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      sourceNode.connect(analyser);
      analyser.connect(audioContext.destination);

      sourceNodeRef.current = sourceNode;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      dataArrayRef.current = dataArray;

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current || !dataArrayRef.current) {
          return;
        }

        analyserRef.current.getByteFrequencyData(dataArrayRef.current);

        let sumSquares = 0;
        for (let i = 0; i < dataArrayRef.current.length; i += 1) {
          const normalized = dataArrayRef.current[i] / 255;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / dataArrayRef.current.length);
        const nextEnergy = Number((rms * 100).toFixed(2));
        setEnergy(nextEnergy);

        if (nextEnergy >= threshold) {
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
      }, 500);

      setIsActive(true);
    } catch (_error) {
      cleanup();
    }

    return cleanup;
  }, [enabled, onTrigger, threshold, videoRef]);

  return {
    energy,
    isActive,
    isTriggered,
  };
}
