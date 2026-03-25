import { useEffect, useMemo, useRef, useState } from 'react';
import { clamp } from '../lib/utils';

const SWEEP_DEGREES = 270;
const START_DEGREES = 135;

function roundToInt(value) {
  return Math.round(Number(value || 0));
}

export default function SensitivityDial({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 100,
  color = '--accent-purple',
}) {
  const svgRef = useRef(null);
  const [inputValue, setInputValue] = useState(String(roundToInt(value)));

  useEffect(() => {
    setInputValue(String(roundToInt(value)));
  }, [value]);

  const geometry = useMemo(() => {
    const radius = 40;
    const fullCirc = 2 * Math.PI * radius;
    const arcLength = fullCirc * (SWEEP_DEGREES / 360);
    const dashOffset = fullCirc * (1 - SWEEP_DEGREES / 360);
    const ratio = clamp((Number(value) - min) / (max - min), 0, 1);
    const progressLength = arcLength * ratio;

    return {
      radius,
      fullCirc,
      arcLength,
      dashOffset,
      progressLength,
    };
  }, [max, min, value]);

  const toDialValue = (clientX, clientY) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;

    let angle = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (angle < 0) {
      angle += 360;
    }

    let adjusted = angle - START_DEGREES;
    if (adjusted < 0) {
      adjusted += 360;
    }

    adjusted = clamp(adjusted, 0, SWEEP_DEGREES);
    const ratio = adjusted / SWEEP_DEGREES;
    return roundToInt(min + ratio * (max - min));
  };

  const handlePoint = (clientX, clientY) => {
    if (!svgRef.current) {
      return;
    }

    const nextValue = toDialValue(clientX, clientY);
    onChange?.(clamp(nextValue, min, max));
  };

  const onPointerDown = (event) => {
    handlePoint(event.clientX, event.clientY);

    const onMove = (moveEvent) => {
      handlePoint(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleInputBlur = () => {
    const parsed = Number(inputValue);
    if (Number.isNaN(parsed)) {
      setInputValue(String(roundToInt(value)));
      return;
    }

    const next = clamp(roundToInt(parsed), min, max);
    setInputValue(String(next));
    onChange?.(next);
  };

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-bg-card p-4">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        className="h-28 w-28 cursor-pointer select-none"
        onPointerDown={onPointerDown}
      >
        <circle
          cx="50"
          cy="50"
          r={geometry.radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
          strokeDasharray={`${geometry.arcLength} ${geometry.fullCirc}`}
          strokeDashoffset={geometry.dashOffset}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50"
          cy="50"
          r={geometry.radius}
          fill="none"
          stroke={`var(${color})`}
          strokeWidth="8"
          strokeDasharray={`${geometry.progressLength} ${geometry.fullCirc}`}
          strokeDashoffset={geometry.dashOffset}
          strokeLinecap="round"
          transform="rotate(135 50 50)"
        />
        <text x="50" y="52" textAnchor="middle" className="fill-text-primary text-[15px] font-bold">
          {roundToInt(value)}
        </text>
      </svg>

      <p className="text-center text-sm font-semibold text-text-primary">{label}</p>
      <p className="text-center text-xs text-text-secondary">{description}</p>

      <input
        type="number"
        min={min}
        max={max}
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        onBlur={handleInputBlur}
        className="w-20 rounded-md border border-border bg-bg-elevated px-2 py-1 text-center text-sm text-text-primary"
      />
    </div>
  );
}
