import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import FixedTimestepViz from "../misc/FixedTimestepViz.jsx";

export default function RealtimeLoopSection() {
  return (
    <SimMathSection
      id="realtime-loop"
      number={5}
      title="Real-time loop"
      intro="A requestAnimationFrame driver with a fixed-timestep accumulator, so physics results never depend on how fast the screen happens to be refreshing."
    >
      <FormulaBlock
        id="fixed-timestep"
        eyebrow="src/lib/sim/engine.js"
        title="Fixed-timestep accumulator"
        formula="\text{accum} \mathrel{+}= \Delta t_{\text{frame}}\cdot\text{speed}, \qquad \text{while } \text{accum}\ge dt:\ \ \text{step}(dt),\ \ \text{accum}\mathrel{-}=dt"
        variables={[
          { symbol: "\\text{accum}", meaning: "The leftover-time bucket — carried over from frame to frame." },
          { symbol: "\\Delta t_{\\text{frame}}", meaning: "Real wall-clock time since the last animation frame." },
          { symbol: "\\text{speed}", meaning: "The playback-speed multiplier (0.5×/1×/2× in the run step)." },
          { symbol: "dt", meaning: "The fixed physics step, 0.01 s — matching the real brain's 100 Hz tick." },
        ]}
        points={[
          "Every animation frame, whatever real time just passed gets banked into the accumulator — nothing is stepped yet.",
          "Then the loop drains that bucket in whole dt-sized chunks, calling the physics step once per chunk, until less than one chunk is left over.",
          "A fast screen (144Hz) fills the bucket in smaller, more frequent deposits than a slow one (60Hz) — but the physics only ever sees dt-sized steps either way, so the trajectory comes out identical.",
          "If a frame takes too long (a stutter, a backgrounded tab), the loop caps how many steps it'll catch up on in one go and drops the rest, rather than freezing the page trying to pay off an unpayable debt.",
        ]}
        viz={<FixedTimestepViz />}
      />
    </SimMathSection>
  );
}
