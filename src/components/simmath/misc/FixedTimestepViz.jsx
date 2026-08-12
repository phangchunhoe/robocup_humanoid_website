import { useEffect, useRef, useState } from "react";
import GlassButton from "../../GlassButton.jsx";
import VizFrame from "../VizFrame.jsx";
import { createEngine, FIXED_DT } from "../../../lib/sim/engine.js";

const BUCKET_W = 60;
const BUCKET_H = 140;

/**
 * Drives the real createEngine loop — the identical accumulator algorithm the run
 * step's physics uses — just at a "speed" slow enough that a 0.01s tick is actually
 * watchable rather than firing 100 times a second.
 */
export default function FixedTimestepViz() {
  const [fill, setFill] = useState(0);
  const [ticks, setTicks] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.03);
  const [flash, setFlash] = useState(false);
  const engineRef = useRef(null);
  const flashTimeout = useRef(0);

  useEffect(() => {
    const engine = createEngine({
      onStep: () => {
        setTicks((t) => t + 1);
        setFlash(true);
        clearTimeout(flashTimeout.current);
        flashTimeout.current = setTimeout(() => setFlash(false), 180);
      },
      onRender: () => {
        setFill(Math.min(1.4, engine.getAccumulator() / FIXED_DT));
      },
    });
    engineRef.current = engine;
    return () => {
      engine.stop();
      clearTimeout(flashTimeout.current);
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSpeed(speed);
  }, [speed]);

  const toggle = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing) {
      engine.stop();
      setPlaying(false);
    } else {
      engine.setSpeed(speed);
      engine.start();
      setPlaying(true);
    }
  };

  const fillH = Math.min(1, fill) * BUCKET_H;

  return (
    <VizFrame
      controls={
        <>
          <GlassButton variant="glass" onClick={toggle}>
            {playing ? "Pause" : "Play"}
          </GlassButton>
          <div className="sm-field-row">
            <label htmlFor="ft-speed">
              Playback speed <span className="sm-field-value">{speed.toFixed(3)}×</span>
            </label>
            <input id="ft-speed" className="sm-range" type="range" min={0.01} max={0.15} step={0.005} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          </div>
        </>
      }
      caption={
        <>
          Ticks fired: <b>{ticks}</b>. Slowed way down for visibility — a real run drains this bucket up to
          100 times a second (dt = 0.01s), not once every couple of seconds.
        </>
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 160 ${BUCKET_H + 30}`} role="img" aria-label="A bucket filling with elapsed time and draining in fixed-size ticks">
        <rect x={(160 - BUCKET_W) / 2} y={10} width={BUCKET_W} height={BUCKET_H} fill="none" className="sm-axis" strokeWidth={2} />
        <rect
          x={(160 - BUCKET_W) / 2 + 2}
          y={10 + (BUCKET_H - fillH) + 2}
          width={BUCKET_W - 4}
          height={Math.max(0, fillH - 4)}
          fill={flash ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 60%, transparent)"}
        />
        <line x1={(160 - BUCKET_W) / 2 - 6} y1={10} x2={(160 - BUCKET_W) / 2 + BUCKET_W + 6} y2={10} className="sm-guide" opacity={flash ? 1 : 0.5} stroke={flash ? "var(--color-accent)" : undefined} />
        <text x={80} y={10 - 6} textAnchor="middle" className="sm-label">
          dt (drain threshold)
        </text>
      </svg>
    </VizFrame>
  );
}
