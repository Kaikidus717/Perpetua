"use client";

import { UNKNOWN, compactUsd } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

const SECONDS_PER_DAY = 86_400;

const PALETTE = {
  light: {
    background: "#fffdfa",
    text: "#6c645c",
    grid: "#efe9e2",
    border: "#e2dcd4",
    line: "#b04a2a",
    top: "rgba(176, 74, 42, 0.14)",
    bottom: "rgba(176, 74, 42, 0.01)",
  },
  dark: {
    background: "#161311",
    text: "#a79e93",
    grid: "#221e1a",
    border: "#2a2521",
    line: "#e0795a",
    top: "rgba(224, 121, 90, 0.18)",
    bottom: "rgba(224, 121, 90, 0.01)",
  },
} as const;

/// One day of the series, as the readout needs it.
interface Point {
  time: number;
  value: number;
}

export function FeeChart({
  days,
  feesUsd,
  height = 240,
  theme = "light",
}: {
  days: number[];
  feesUsd: number[];
  height?: number;
  theme?: keyof typeof PALETTE;
}) {
  const container = useRef<HTMLDivElement>(null);
  /// What the crosshair is over, or `null` when it is off the plot. Showing the value under the
  /// pointer is the difference between a picture of the data and something you can read.
  const [hovered, setHovered] = useState<Point | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const signature = `${days.length}|${feesUsd.join(",")}`;
  // The chart is keyed on the numbers themselves, not on the arrays they arrived in, so `signature`
  // is the dependency on purpose.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on `signature`
  const points = useMemo(() => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - Math.max(days.length - 1, 0) * SECONDS_PER_DAY;
    return days.map((_, index) => ({
      time: start + index * SECONDS_PER_DAY,
      value: feesUsd[index] ?? 0,
    }));
  }, [signature]);

  useEffect(() => {
    let disposed = false;
    let remove: (() => void) | undefined;

    void (async () => {
      const { AreaSeries, ColorType, createChart } = await import("lightweight-charts");
      const element = container.current;
      if (!element || disposed) return;

      const palette = PALETTE[theme];
      const chart = createChart(element, {
        height,
        layout: {
          background: { type: ColorType.Solid, color: palette.background },
          textColor: palette.text,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          fontSize: 11,
        },
        /// Horizontal hairlines only: vertical rules add nothing to a single time series and make the
        /// plot look like a spreadsheet.
        grid: {
          vertLines: { visible: false },
          horzLines: { color: palette.grid },
        },
        rightPriceScale: { borderColor: palette.border },
        timeScale: { borderColor: palette.border, fixLeftEdge: true },
        crosshair: {
          vertLine: { color: palette.border, width: 1 },
          horzLine: { color: palette.border, width: 1 },
        },
      });

      const series = chart.addSeries(AreaSeries, {
        lineColor: palette.line,
        topColor: palette.top,
        bottomColor: palette.bottom,
      });

      series.setData(points as Parameters<typeof series.setData>[0]);
      chart.timeScale().fitContent();

      chart.subscribeCrosshairMove((param) => {
        const data = (
          param.seriesData as unknown as Map<unknown, { time?: number; value?: number } | undefined>
        ).get(series);
        setHovered(
          data && typeof data.value === "number" && typeof data.time === "number"
            ? { time: data.time, value: data.value }
            : null,
        );
      });

      remove = () => chart.remove();
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, [points, height, theme]);

  const latest = points[points.length - 1];
  const shown = hovered ?? latest;
  const when =
    mounted && shown
      ? new Date(shown.time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

  return (
    <div>
      {/* The chart draws to a canvas, which a screen reader sees as nothing. This sentence is the text
          alternative: the window, the first and last day, and where the peak sits. */}
      <p className="sr-only">
        {`Daily fees over ${points.length} days, from ${compactUsd(points[0]?.value)} on the first day to ${compactUsd(latest?.value)} on the last.`}
      </p>
      <div className="flex items-baseline justify-between gap-3 text-[11px] text-muted">
        <span>{when ? (hovered ? when : `latest · ${when}`) : UNKNOWN}</span>
        <span className="tnum">{shown ? compactUsd(shown.value) : "—"}</span>
      </div>
      <div ref={container} className="mt-1 w-full overflow-hidden rounded-md" />
    </div>
  );
}
