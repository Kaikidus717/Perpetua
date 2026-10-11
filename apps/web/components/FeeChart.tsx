"use client";

import { useEffect, useMemo, useRef } from "react";

const SECONDS_PER_DAY = 86_400;

export function FeeChart({
  days,
  feesUsd,
  height = 240,
}: {
  days: number[];
  feesUsd: number[];
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);

  /// `days` and `feesUsd` arrive as fresh arrays on every render, so depending on them directly tore
  /// the chart down and rebuilt it constantly — that is what made the page stutter while scrolling.
  /// The numbers themselves change only when a fetch lands, so the chart is keyed on the numbers.
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

      const chart = createChart(element, {
        height,
        layout: {
          background: { type: ColorType.Solid, color: "#ffffff" },
          textColor: "#71717a",
        },
        grid: {
          vertLines: { color: "#f4f4f5" },
          horzLines: { color: "#f4f4f5" },
        },
        rightPriceScale: { borderColor: "#e4e4e7" },
        timeScale: { borderColor: "#e4e4e7", fixLeftEdge: true },
      });

      const series = chart.addSeries(AreaSeries, {
        lineColor: "#15803d",
        topColor: "rgba(21, 128, 61, 0.14)",
        bottomColor: "rgba(21, 128, 61, 0.01)",
      });

      series.setData(points as Parameters<typeof series.setData>[0]);
      chart.timeScale().fitContent();
      remove = () => chart.remove();
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, [points, height]);

  return <div ref={container} className="w-full overflow-hidden rounded-md border border-line" />;
}
