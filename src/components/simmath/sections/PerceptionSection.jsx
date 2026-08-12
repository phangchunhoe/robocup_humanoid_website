import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import FovConeViz from "../perception/FovConeViz.jsx";
import ConfidenceDecayViz from "../perception/ConfidenceDecayViz.jsx";
import JitterGrowthViz from "../perception/JitterGrowthViz.jsx";

const SRC = "src/lib/sim/perception.js";

export default function PerceptionSection() {
  return (
    <SimMathSection
      id="perception-model"
      number={2}
      title="Perception model"
      intro="What the robot's vision can actually see of the ball, as opposed to the physics engine's ground truth — the FOV cone, a confidence readout, and distance-scaled position noise."
    >
      <FormulaBlock
        id="fov-test"
        eyebrow={SRC}
        title="Field-of-view test"
        formula="\text{visible} \iff |\text{yaw}| \le 60° \ \wedge\ \text{range} \le R"
        variables={[
          { symbol: "\\text{yaw}", meaning: "The ball's bearing in the robot's own frame — 0° dead ahead." },
          { symbol: "\\text{range}", meaning: "Straight-line distance to the ball." },
          { symbol: "R", meaning: "The configured sight radius." },
        ]}
        points={[
          "Two separate checks, both have to pass: within a 120°-wide cone (60° each side of dead ahead), and not further away than R.",
          "Nothing in between — a ball one metre past R is exactly as invisible as one ten fields away.",
          "This is the gate everything else in this section sits behind: confidence and jitter only ever apply to a ball that already passed this test.",
          "A ball straight behind the robot fails the bearing check no matter how close it is.",
        ]}
        viz={<FovConeViz />}
      />

      <FormulaBlock
        id="confidence-decay"
        eyebrow={SRC}
        title="Confidence decay"
        formula="k = \frac{\ln(100/C_0)}{R}, \qquad \text{confidence} = \max\!\big(C_0,\ 100\,e^{-k\cdot\text{range}}\big)"
        variables={[
          { symbol: "C_0", meaning: "The fixed confidence floor (50%)." },
          { symbol: "R", meaning: "The sight radius." },
          { symbol: "k", meaning: "A decay rate, solved from C₀ and R so the curve lands exactly on the floor at the edge of vision." },
        ]}
        points={[
          "k isn't a fixed constant — it's back-solved so the exponential curve passes through exactly (0, 100%) and (R, C₀).",
          "Nothing to configure by hand: change the sight-range slider and the decay rate quietly re-tunes itself to match.",
          "Confidence never drops below the floor while still inside the cone — it flattens out rather than trailing to zero.",
          "The moment range exceeds R, the field-of-view test above fails and confidence is reported as a flat 0%, not a continuation of this curve.",
        ]}
        viz={<ConfidenceDecayViz />}
      />

      <FormulaBlock
        id="jitter-growth"
        eyebrow={SRC}
        title="Jitter growth"
        formula={[
          "\\sigma(\\text{range}) = I\\big(1-e^{-K\\cdot\\text{range}}\\big)",
          "p' = p + \\mathcal N(0,\\sigma^2)",
        ]}
        variables={[
          { symbol: "I", meaning: "Configured maximum noise level — the \"Ball jitter intensity\" slider, in metres." },
          { symbol: "K", meaning: "A fixed growth-rate constant (0.3)." },
          { symbol: "p, p'", meaning: "The ball's true and perceived position, on one axis." },
        ]}
        points={[
          "Right at the robot's feet, σ is essentially 0 — the perceived position is basically exact.",
          "As range grows the noise ramps up fast at first, then levels off — it never exceeds the configured intensity I, no matter how far away the ball is.",
          "That σ is then used as the standard deviation for ordinary Gaussian noise (the same formula from Section 1), applied separately to x and y.",
          "This is a genuinely different curve shape from confidence decay above: one grows toward a ceiling, the other decays toward a floor.",
        ]}
        viz={<JitterGrowthViz />}
      />
    </SimMathSection>
  );
}
