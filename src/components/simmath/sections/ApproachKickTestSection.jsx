import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import CircularPlacementViz from "../misc/CircularPlacementViz.jsx";
import TimingAverageViz from "../misc/TimingAverageViz.jsx";

const SRC = "src/lib/sim/approachKickTest.js";

export default function ApproachKickTestSection() {
  return (
    <SimMathSection
      id="approach-kick-test"
      number={6}
      title="Approach & Kick Time test"
      intro="The Testing tab's headless sweep: 36 approach angles × 3 repeats, run entirely off-screen against the pasted striker program, timing how long each takes to reach a kick."
    >
      <FormulaBlock
        id="circular-placement"
        eyebrow={SRC}
        title="Circular placement"
        formula="(r_x,r_y) = (x_{\text{ball}},y_{\text{ball}}) + \rho\,(\cos\alpha,\sin\alpha), \qquad \theta = \operatorname{atan2}(y_{\text{ball}}-r_y,\ x_{\text{ball}}-r_x)"
        variables={[
          { symbol: "(x_{\\text{ball}},y_{\\text{ball}})", meaning: "The fixed ball position for the whole sweep." },
          { symbol: "\\rho", meaning: "The sweep radius — how far from the ball every placement starts." },
          { symbol: "\\alpha", meaning: "The swept angle, stepped in 10° increments all the way around." },
        ]}
        points={[
          "Every run starts the robot the same distance from the ball, at a different angle around it — the swept parameter is position on the circle, not heading.",
          "The robot's own heading isn't swept independently — it's always pointed straight back at the ball, so every run starts already looking at its target.",
          "36 angles, 3 repeats each, is 108 runs total per sweep — enough to see whether approach time depends on which side of the ball the robot starts from.",
        ]}
        viz={<CircularPlacementViz />}
      />

      <FormulaBlock
        id="timing-average"
        eyebrow={SRC}
        title="Timing"
        formula="t_{\text{elapsed}} = (\text{tick}_{\text{kick}}-\text{tick}_{\text{start}})\cdot dt, \qquad \bar t_\alpha = \frac{1}{n}\sum_{i=1}^n t_i"
        variables={[
          { symbol: "\\text{tick}_{\\text{start}}", meaning: "Tick number of the first \"chase\" or \"adjust\" decision." },
          { symbol: "\\text{tick}_{\\text{kick}}", meaning: "Tick number of the first \"kick\" or \"cross\" decision after it." },
          { symbol: "\\bar t_\\alpha", meaning: "The averaged time reported for approach angle α." },
        ]}
        points={[
          "The stopwatch isn't wall-clock time — it's a tick count, converted to seconds by multiplying by the fixed 0.01s step, so it's exactly reproducible regardless of how fast the sweep actually runs on screen.",
          "It starts the moment the striker program first decides to chase or adjust, and stops the moment it first decides to kick or cross — whatever happens in between is what's being measured.",
          "A run that never reaches a kick decision within the time limit is recorded as timed out and left out of the average entirely, rather than silently counted as instant or infinite.",
          "Each angle's reported number is a plain arithmetic mean over its own repeats — nothing fancier, no weighting.",
        ]}
        viz={<TimingAverageViz />}
      />
    </SimMathSection>
  );
}
