import { useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import { makeRng } from "../../../lib/sim/physics.js";

const COUNT = 14;

function draw(seed) {
  const rng = makeRng(seed);
  return Array.from({ length: COUNT }, () => rng());
}

export default function PrngViz() {
  const [seed, setSeed] = useState(12345);
  const [values, setValues] = useState(() => draw(12345));
  const [drawCount, setDrawCount] = useState(1);

  return (
    <VizFrame
      caption={
        <>
          Seed <b>{seed}</b> has now been drawn <b>{drawCount}</b> time{drawCount === 1 ? "" : "s"} — the
          bars above are byte-for-byte identical every time, because the generator's next() only ever
          depends on the seed and how many times it's been called.
        </>
      }
      controls={
        <>
          <div className="sm-field-row">
            <label htmlFor="prng-seed">
              Seed <span className="sm-field-value">{seed}</span>
            </label>
            <input
              id="prng-seed"
              className="sm-range"
              type="range"
              min={1}
              max={99999}
              step={1}
              value={seed}
              onChange={(e) => {
                setSeed(Number(e.target.value));
                setDrawCount(0);
              }}
            />
          </div>
          <GlassButton
            variant="glass"
            onClick={() => {
              setValues(draw(seed));
              setDrawCount((n) => n + 1);
            }}
          >
            Draw sequence
          </GlassButton>
        </>
      }
    >
      <svg className="sm-diagram" viewBox="0 0 320 140" role="img" aria-label="Bar chart of pseudo-random numbers drawn from the seeded generator">
        {values.map((v, i) => {
          const w = 320 / COUNT;
          const h = v * 110;
          return (
            <rect
              key={i}
              x={i * w + 2}
              y={128 - h}
              width={w - 4}
              height={h}
              rx={2}
              fill="var(--color-accent)"
              opacity={0.4 + v * 0.5}
            />
          );
        })}
        <line x1={0} y1={128} x2={320} y2={128} stroke="var(--color-separator)" strokeWidth={1} />
      </svg>
    </VizFrame>
  );
}
