import { cn } from "../../lib/cn";
import type { MetricsPoint } from "./types";

type Series = {
  name: string;
  colorClassName: string;
  points: MetricsPoint[];
};

type TimeSeriesChartProps = {
  series: Series[];
  className?: string;
  yFormatter?: (value: number) => string;
};

function buildPath(points: MetricsPoint[], width: number, height: number, min: number, max: number) {
  if (points.length === 0) return "";
  const yRange = max - min || 1;
  const xStep = points.length > 1 ? width / (points.length - 1) : width;
  return points
    .map((point, index) => {
      const x = xStep * index;
      const y = height - ((point.value - min) / yRange) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function TimeSeriesChart({ series, className, yFormatter }: TimeSeriesChartProps) {
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  if (allValues.length === 0) {
    return <div className={cn("h-52 rounded-md border border-dashed border-border bg-muted/50", className)} />;
  }
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const viewWidth = 680;
  const viewHeight = 220;

  return (
    <div className={cn("space-y-2", className)}>
      <svg viewBox={`0 0 ${viewWidth} ${viewHeight}`} className="h-56 w-full rounded-md border border-border bg-card">
        {[0.2, 0.4, 0.6, 0.8].map((fraction) => {
          const y = viewHeight * fraction;
          return <line key={fraction} x1={0} y1={y} x2={viewWidth} y2={y} className="stroke-muted" strokeWidth={1} />;
        })}
        {series.map((item) => {
          const path = buildPath(item.points, viewWidth, viewHeight, minValue, maxValue);
          if (!path) return null;
          return <path key={item.name} d={path} className={cn("fill-none", item.colorClassName)} strokeWidth={2.5} />;
        })}
      </svg>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {series.map((item) => (
          <div key={item.name} className="inline-flex items-center gap-2">
            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", item.colorClassName.replace("stroke-", "bg-"))} />
            <span>{item.name}</span>
          </div>
        ))}
        <span className="ml-auto">
          Min {yFormatter ? yFormatter(minValue) : minValue.toFixed(2)} / Max{" "}
          {yFormatter ? yFormatter(maxValue) : maxValue.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
