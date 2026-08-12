import { useMemo, useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import MiniBarChart from "../MiniBarChart.jsx";
import { makeRng, gaussian } from "../../../lib/sim/physics.js";

const BIN_COUNT = 17;
const BIN_MIN = -3;
const BIN_MAX = 3;

function drawSamples(seed, n) {
  const rng = makeRng(seed);
  const bins = new Array(BIN_COUNT).fill(0);
  const binWidth = (BIN_MAX - BIN_MIN) / BIN_COUNT;
  for (let i = 0; i < n; i += 1) {
    const z = gaussian(rng);
    const idx = Math.min(BIN_COUNT - 1, Math.max(0, Math.floor((z - BIN_MIN) / binWidth)));
    bins[idx] += 1;
  }
  return bins;
}

export default function GaussianViz() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 99999));
  const [n, setN] = useState(600);
  const bins = useMemo(() => drawSamples(seed, n), [seed, n]);

  const bars = bins.map((v, i) => ({ value: v }));
  const midIndex = Math.floor(BIN_COUNT / 2);

  return (
    <VizFrame
      caption={
        <>
          {n} samples of <code>gaussian(rng)</code> — most land near 0, and the bars taper off fast toward
          the edges. Regenerate and the shape stays a bell curve every time; only the exact bar heights
          jitter, exactly what you'd expect from noise with the same underlying distribution.
        </>
      }
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="gauss-n">
              Samples <span className="sm-field-value">{n}</span>
            </label>
            <input
              id="gauss-n"
              className="sm-range"
              type="range"
              min={50}
              max={2000}
              step={50}
              value={n}
              onChange={(e) => setN(Number(e.target.value))}
            />
          </div>
          <GlassButton variant="glass" onClick={() => setSeed(Math.floor(Math.random() * 99999))}>
            Regenerate
          </GlassButton>
        </>
      }
    >
      <MiniBarChart
        width={320}
        height={170}
        bars={bars}
        xLabel="z (std. deviations)"
        yLabel="count"
        barColor={(_, i) => (i === midIndex ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 55%, transparent)")}
      />
    </VizFrame>
  );
}
