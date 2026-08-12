// Small histogram — used for the Box-Muller Gaussian sample distribution and the
// approach & kick time test's per-angle timing bars.

const PAD = { l: 30, r: 10, t: 10, b: 24 };

export default function MiniBarChart({ width = 320, height = 170, bars, xLabel, yLabel, barColor }) {
  const iw = width - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const maxV = Math.max(1e-6, ...bars.map((b) => b.value));
  const bw = iw / bars.length;

  return (
    <svg className="mchart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={xLabel || "histogram"}>
      <line className="mchart-axis" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} />
      <line className="mchart-axis" x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
      {bars.map((b, i) => {
        const h = (b.value / maxV) * ih;
        return (
          <rect
            key={i}
            className="mchart-bar"
            style={barColor ? { fill: barColor(b, i) } : undefined}
            x={PAD.l + i * bw + 1}
            y={PAD.t + ih - h}
            width={Math.max(0, bw - 2)}
            height={h}
          />
        );
      })}
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
