"use client";

/**
 * A thin single-series trend line — one hue, no axes, no legend (a single
 * series names itself via the card title it sits under). Each point carries
 * a native <title> so a value is always a hover away without a custom
 * tooltip layer.
 */
export default function Sparkline({
  values,
  color = "#8f5cff",
  height = 32,
  formatValue = (v: number) => v.toLocaleString(),
  labels,
}: {
  values: number[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
  labels?: string[];
}) {
  const width = 120;
  const max = Math.max(1, ...values);
  const n = values.length;
  const stepX = n > 1 ? width / (n - 1) : 0;
  const y = (v: number) => height - 3 - (v / max) * (height - 6);

  const points = values.map((v, i) => [i * stepX, y(v)] as const);
  const path = points.map(([x, py], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  if (values.every((v) => v === 0)) {
    return <div style={{ height }} className="grid place-items-center text-[10px] text-slate-600">No activity</div>;
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img">
      <path d={area} fill={color} opacity={0.12} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {points.map(([x, py], i) => (
        <circle key={i} cx={x} cy={py} r={5} fill="transparent">
          <title>
            {labels?.[i] ?? ""} {formatValue(values[i])}
          </title>
        </circle>
      ))}
      <circle cx={points[n - 1][0]} cy={points[n - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}
