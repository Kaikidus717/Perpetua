"use client";

import { type CSSProperties, useId } from "react";

export function ValueSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  minLabel,
  maxLabel,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /// How the value reads as text, e.g. `72%`. Used for the readout and for `aria-valuetext`.
  format: (value: number) => string;
  onChange: (value: number) => void;
  minLabel: string;
  maxLabel: string;
  hint?: string;
}) {
  const id = useId();
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const fill: CSSProperties = {
    backgroundImage: `linear-gradient(to right, rgb(var(--accent)) 0 ${percent}%, rgb(var(--line)) ${percent}% 100%)`,
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] text-muted">
          {label}
        </label>
        <output htmlFor={id} className="tnum text-[13px] font-medium text-ink">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="track w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(event) => onChange(Number(event.target.value))}
        style={fill}
      />
      <div className="flex items-baseline justify-between text-[11px] text-muted">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-muted">{hint}</p> : null}
    </div>
  );
}
