type SparklineProps = {
  values: number[];
  strokeClassName?: string;
};

function toPath(values: number[], width: number, height: number) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yRange = max - min || 1;
  const xStep = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * xStep;
      const y = height - ((value - min) / yRange) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function Sparkline({ values, strokeClassName = "stroke-blue-500" }: SparklineProps) {
  const path = toPath(values, 320, 80);
  if (!path) {
    return <div className="h-20 rounded-md border border-dashed border-border bg-muted/50" />;
  }
  return (
    <svg viewBox="0 0 320 80" className="h-20 w-full">
      <path d={path} className={`${strokeClassName} fill-none`} strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  );
}
