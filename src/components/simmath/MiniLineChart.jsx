// Small axes + polyline chart for plotting a function over a domain — confidence
// decay, jitter growth, ball-roll speed vs. time, and similar curves throughout the
// Simulation Math page. Not a general charting library: just enough to plot one curve,
// an optional live marker on it, and a couple of axis ticks.

const PAD = { l: 36, r: 12, t: 12, b: 26 };

export default function MiniLineChart({
  width = 320,
  height = 170,
  xDomain,
  yDomain,
  points,
  markerX,
  xTicks = [],
  yTicks = [],
  xLabel,
  yLabel,
  markerLabel,
}) {
  const iw = width - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const sx = (x) => PAD.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * iw;
  const sy = (y) => PAD.t + ih - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * ih;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" ");

  let markerPoint = null;
  if (markerX != null) {
    let closest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - markerX) < Math.abs(closest.x - markerX)) closest = p;
    }
    markerPoint = closest;
  }

  return (
    <svg className="mchart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={xLabel && yLabel ? `${yLabel} vs ${xLabel} chart` : "chart"}>
      <line className="mchart-axis" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} />
      <line className="mchart-axis" x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
      {yTicks.map((t) => (
        <g key={`y${t.value}`}>
          <line className="mchart-tick" x1={PAD.l - 4} y1={sy(t.value)} x2={PAD.l} y2={sy(t.value)} />
          <text className="mchart-ticklabel" x={PAD.l - 7} y={sy(t.value) + 3} textAnchor="end">
            {t.label}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t.value}`}>
          <line className="mchart-tick" x1={sx(t.value)} y1={PAD.t + ih} x2={sx(t.value)} y2={PAD.t + ih + 4} />
          <text className="mchart-ticklabel" x={sx(t.value)} y={PAD.t + ih + 16} textAnchor="middle">
            {t.label}
          </text>
        </g>
      ))}
      <path className="mchart-curve" d={path} fill="none" />
      {markerPoint && (
        <g>
          <line className="mchart-marker-line" x1={sx(markerPoint.x)} y1={PAD.t} x2={sx(markerPoint.x)} y2={PAD.t + ih} />
          <circle className="mchart-marker-dot" cx={sx(markerPoint.x)} cy={sy(markerPoint.y)} r={4.5} />
          {markerLabel && (
            <text className="mchart-markerlabel" x={sx(markerPoint.x)} y={sy(markerPoint.y) - 10} textAnchor="middle">
              {markerLabel(markerPoint)}
            </text>
          )}
        </g>
      )}
      {xLabel && (
        <text className="mchart-axislabel" x={PAD.l + iw / 2} y={height - 2} textAnchor="middle">
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text className="mchart-axislabel" x={-(PAD.t + ih / 2)} y={11} textAnchor="middle" transform="rotate(-90)">
          {yLabel}
        </text>
      )}
    </svg>
  );
}
