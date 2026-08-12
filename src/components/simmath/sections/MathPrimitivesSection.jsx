import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import NormCapSigmoidViz from "../mathprim/NormCapSigmoidViz.jsx";
import AngleNormViz from "../mathprim/AngleNormViz.jsx";
import LineGeometryViz from "../mathprim/LineGeometryViz.jsx";
import GoalpostBearingsViz from "../mathprim/GoalpostBearingsViz.jsx";
import WalkToPoseViz from "../mathprim/WalkToPoseViz.jsx";

const SRC = "src/lib/sim/host.js";

export default function MathPrimitivesSection() {
  return (
    <SimMathSection
      id="math-primitives"
      number={3}
      title="Math primitives"
      intro="A reimplementation of the brain's own include/utils/math.h helpers, exposed as globals to the interpreted C++ since the pasted code calls straight into them."
    >
      <FormulaBlock
        id="norm-cap-sigmoid"
        eyebrow={SRC}
        title="norm / cap / sigmoid"
        formula="\operatorname{norm}(x,y)=\sqrt{x^2+y^2}, \qquad \operatorname{cap}(x,\text{lo},\text{hi})=\max(\min(x,\text{hi}),\text{lo}), \qquad \operatorname{sigmoid}(x)=\frac{1}{1+e^{s(x-\text{shift})}}"
        variables={[
          { symbol: "x, y", meaning: "(in norm) the two components of a 2D vector." },
          { symbol: "\\text{lo}, \\text{hi}", meaning: "(in cap) the lower and upper bounds a value gets squeezed into." },
          { symbol: "\\text{shift}, s", meaning: "(in sigmoid) where the curve's midpoint sits, and how sharply it transitions there." },
        ]}
        points={[
          "norm is the everyday distance formula — Pythagoras, nothing more.",
          "cap is a two-sided clamp: below lo, snap up to lo; above hi, snap down to hi; in between, leave it alone.",
          "sigmoid maps any real number onto (0, 1) with a smooth S-curve — useful anywhere the code wants a gradual transition instead of an if-statement's hard edge.",
          "All three are one-liners, but they show up constantly throughout the interpreted C++ — worth knowing cold.",
        ]}
        viz={<NormCapSigmoidViz />}
      />

      <FormulaBlock
        id="angle-norm"
        eyebrow={SRC}
        title="Angle normalization"
        formula="\operatorname{toPInPI}(\theta) = \Big(\theta+\pi+2n\pi\Big)\bmod 2\pi\ -\ \pi, \qquad n = \left\lfloor\left|\frac{\theta}{2\pi}\right|\right\rfloor+1"
        variables={[
          { symbol: "\\theta", meaning: "An input angle in radians — can be any size, including several full turns." },
          { symbol: "n", meaning: "A whole-number correction term, just large enough to keep the modulo result positive." },
        ]}
        points={[
          "Angles wrap: 370° and 10° point the same way, and this function is what makes the code treat them as equal.",
          "n exists purely so the JavaScript/C++ modulo operator (which can return negative results) never does — it pads theta up by enough full turns first.",
          "The result always lands in (−180°, 180°], regardless of how many times the input wound around.",
          "This runs on essentially every bearing/heading comparison in the codebase — without it, a robot facing 179° and one facing −179° would look 358° apart instead of 2°.",
        ]}
        viz={<AngleNormViz />}
      />

      <FormulaBlock
        id="line-geometry"
        eyebrow={SRC}
        title="Line/segment geometry"
        formula={[
          "\\operatorname{cross}(a,b)=a_x b_y-a_y b_x, \\qquad \\operatorname{inner}(a,b)=a_xb_x+a_yb_y",
          "\\operatorname{perpDist}(p,l) = \\frac{\\operatorname{cross}(\\vec l,\\ p-l_0)}{\\lVert \\vec l\\rVert}",
          "\\operatorname{minDist}(p,l) = \\begin{cases} \\lVert p-l_0\\rVert & \\operatorname{inner}(\\vec l,\\,p-l_0) < 0 \\\\ \\lVert p-l_1\\rVert & \\operatorname{inner}(-\\vec l,\\,p-l_1) < 0 \\\\ |\\operatorname{perpDist}(p,l)| & \\text{otherwise} \\end{cases}",
        ]}
        variables={[
          { symbol: "a, b", meaning: "Any two 2D vectors." },
          { symbol: "l, l_0, l_1", meaning: "A line segment and its two endpoints." },
          { symbol: "p", meaning: "The point being measured against it." },
        ]}
        points={[
          "cross tells you which side of a line a point is on; inner (dot product) tells you how much two directions line up — both textbook vector-algebra building blocks.",
          "perpDist treats the segment as an infinitely long line and measures straight across at a right angle — it can \"cheat\" past either end.",
          "minDist is the honest version: it checks whether the perpendicular foot actually falls on the segment, and if not, falls back to whichever endpoint is closer.",
          "The two inner(...) < 0 checks are exactly that test — a negative dot product means the point has walked past that endpoint.",
        ]}
        viz={<LineGeometryViz />}
      />

      <FormulaBlock
        id="goalpost-bearings"
        eyebrow={SRC}
        title="Goalpost bearings and kick-direction bisector"
        formula="\theta_{L,R} = \operatorname{atan2}\!\big(y_{L,R}-y_{\text{ball}},\ x_{\text{post}}-x_{\text{ball}}\big), \qquad \operatorname{calcKickDir} = \operatorname{toPInPI}\!\left(\frac{\theta_L+\theta_R}{2}\right)"
        variables={[
          { symbol: "\\theta_L, \\theta_R", meaning: "Bearing from the ball to the left and right goalposts." },
          { symbol: "(x_{\\text{post}}, y_{L,R})", meaning: "Each post's field position — same x, opposite y." },
        ]}
        points={[
          "Two plain compass bearings — atan2 from the ball to each post — nothing more exotic than that.",
          "The default kick direction is just the midpoint of those two angles, which points at the centre of the goal mouth.",
          "Because it's an average of two angles rather than an average of two points, this still behaves correctly even when the ball is very close to the goal line.",
          "Real code layers more on top of this (a margin that shrinks the effective goal width, obstruction checks) — this is the bisector at its core.",
        ]}
        viz={<GoalpostBearingsViz />}
      />

      <FormulaBlock
        id="walk-to-pose"
        eyebrow={SRC}
        title="Walk-to-pose controller"
        formula={[
          "\\text{range} = \\sqrt{(t_x-x)^2+(t_y-y)^2}, \\qquad \\theta_{\\text{err}} = \\operatorname{toPInPI}(\\operatorname{atan2}(t_y-y,\\,t_x-x)-\\theta)",
          "\\text{short-range:}\\quad (v_x,v_y) = \\text{range}\\cdot(\\cos\\theta_{\\text{err}},\\ \\sin\\theta_{\\text{err}}), \\qquad \\text{long-range:}\\quad v_x = \\operatorname{cap}(\\text{range}, \\pm v_{x,\\max}),\\ \\ \\dot\\theta=\\theta_{\\text{err}}",
        ]}
        variables={[
          { symbol: "(t_x,t_y)", meaning: "The target point being walked to." },
          { symbol: "(x,y,\\theta)", meaning: "The robot's current pose." },
          { symbol: "\\theta_{\\text{err}}", meaning: "Heading error between where the robot faces and where the target actually is." },
        ]}
        points={[
          "Far from the target, the robot turns to face it and walks forward at a steady capped speed — direction matters, raw distance doesn't.",
          "Close to the target, it walks directly at it with speed proportional to remaining distance, so it naturally slows down as it arrives.",
          "The two modes switch on distance alone (against a threshold), with a small hysteresis band in the real code so it doesn't flicker back and forth right at the boundary.",
          "The real moveToPoseOnField2 layers an obstacle-avoidance state machine on top of this — this diagram shows the pose-controller core, with that layer left out.",
        ]}
        note="Simplified for this diagram: omits the real function's obstacle-avoidance branches and the long/short hysteresis band."
        viz={<WalkToPoseViz />}
      />
    </SimMathSection>
  );
}
