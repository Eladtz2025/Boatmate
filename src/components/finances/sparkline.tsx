/**
 * Hand-rolled sparkline — a single polyline plus a soft area fill. No chart
 * library: six points do not justify one, and this keeps the bundle honest.
 */
export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 40;
  const pad = 3;
  const max = Math.max(...values, 1);
  const step = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - pad - (value / max) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${points.join(" L")}`;
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <div dir="ltr" className={className ?? "h-10 w-full"}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="size-full"
        aria-hidden
      >
        <path d={area} fill="var(--color-teal-400)" fillOpacity="0.12" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-teal-400)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
