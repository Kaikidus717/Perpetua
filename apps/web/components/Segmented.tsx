"use client";

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  /// Names the group for assistive technology; the control itself is icon-free, so it needs words.
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 inline-flex min-w-0 shrink-0 items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            /// 44px on touch, compact under a mouse: the control sits in a heading row, and a row of
            /// tall buttons there would outshout the number it filters.
            className={`min-h-11 rounded-[6px] px-3 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none sm:min-h-8 sm:px-2.5 sm:text-[12px] ${
              active ? "bg-accent font-medium text-canvas" : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
