"use client";

import { useEffect, useRef } from "react";

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

      const end = Math.floor(Date.now() / 1000);
      const start = end - Math.max(days.length - 1, 0) * SECONDS_PER_DAY;
      series.setData(
        days.map((_, index) => ({
          time: (start + index * SECONDS_PER_DAY) as number,
          value: feesUsd[index] ?? 0,
        })) as Parameters<typeof series.setData>[0],
      );
      chart.timeScale().fitContent();
      remove = () => chart.remove();
    })();

    return () => {
      disposed = true;
      remove?.();
    };
  }, [days, feesUsd, height]);

  return <div ref={container} className="w-full overflow-hidden rounded-md border border-line" />;
}
