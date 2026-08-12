import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import CubicBezierViz from "../curves/CubicBezierViz.jsx";
import LongRangeCurveViz from "../curves/LongRangeCurveViz.jsx";

export default function TelemetryCurvesSection() {
  return (
    <SimMathSection
      id="telemetry-curves"
      number={4}
      title="Telemetry curve reconstruction"
      intro="How the drawn chase path is redrawn from the interpreted C++'s own locals every tick — nothing here is a stored path, it's recomputed fresh each time."
    >
      <FormulaBlock
        id="cubic-bezier"
        eyebrow="src/lib/sim/curves.js"
        title="Cubic Bézier"
        formula="B(s) = (1-s)^3P_0 + 3(1-s)^2sP_1 + 3(1-s)s^2P_2 + s^3P_3, \qquad s\in[0,1]"
        variables={[
          { symbol: "P_0, P_3", meaning: "The curve's start and end points, read from the interpreted C++'s own locals." },
          { symbol: "P_1, P_2", meaning: "Two \"handle\" points that pull the curve's shape, also read from the interpreted C++." },
          { symbol: "s", meaning: "The sweep parameter, stepped from 0 to 1 to trace the curve." },
        ]}
        points={[
          "A weighted blend of all four points, where the weights (the four (1-s)/s terms) shift smoothly from favouring P0 at s=0 to favouring P3 at s=1.",
          "P1 and P2 never sit on the curve itself — they only pull it, the way handles on a vector-drawing tool's pen tool do.",
          "This exact function is imported from curves.js by both this diagram and runtime.js's live telemetry — dragging a point here is running the identical code that draws the real chase path.",
          "Nothing about this curve is stored between ticks — every frame, the interpreted C++ computes fresh P0..P3 and this gets re-evaluated from scratch.",
        ]}
        viz={<CubicBezierViz />}
      />

      <FormulaBlock
        id="long-range-curve"
        eyebrow="src/lib/sim/curves.js"
        title="Exponential-decay long-range curve"
        formula="u(s) = u_0(1-s), \qquad v(s) = v_0\,e^{-D\cdot s}, \qquad P(s) = \text{target} + u(s)\hat u + v(s)\hat v"
        variables={[
          { symbol: "\\hat u, \\hat v", meaning: "Unit vectors along the kick direction and perpendicular to it." },
          { symbol: "u_0, v_0", meaning: "The curve's starting along-track and cross-track offsets from the target." },
          { symbol: "D", meaning: "The decay constant controlling how fast the sideways offset shrinks." },
        ]}
        points={[
          "Built in a rotated frame aligned to the kick direction, not in raw field x/y — that's what \\hat u and \\hat v are for.",
          "Along the kick direction, the gap closes in a straight line — steady, no acceleration built in.",
          "Across the kick direction, the offset shrinks exponentially — fast at first, tapering off — so the path curves in hard early and straightens out near the target.",
          "Unlike the Bézier curve above, there's no second control point pulling the arrival angle — the exponential decay alone guarantees the path always approaches from one consistent side, never overshooting into an S-curve.",
        ]}
        viz={<LongRangeCurveViz />}
      />
    </SimMathSection>
  );
}
