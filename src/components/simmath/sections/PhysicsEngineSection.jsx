import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import PrngViz from "../physics/PrngViz.jsx";
import GaussianViz from "../physics/GaussianViz.jsx";
import SpeedCapViz from "../physics/SpeedCapViz.jsx";
import RateLimitViz from "../physics/RateLimitViz.jsx";
import FrameIntegrationViz from "../physics/FrameIntegrationViz.jsx";
import BallRollViz from "../physics/BallRollViz.jsx";
import KickImpulseViz from "../physics/KickImpulseViz.jsx";
import TorsoCollisionViz from "../physics/TorsoCollisionViz.jsx";
import TerminationViz from "../physics/TerminationViz.jsx";
import FrameTransformViz from "../physics/FrameTransformViz.jsx";

const SRC = "src/lib/sim/physics.js";

export default function PhysicsEngineSection() {
  return (
    <SimMathSection
      id="physics-engine"
      number={1}
      title="Physics engine"
      intro="Rigid-body-lite physics for one robot and one ball on the pitch, ticked at a fixed 100 Hz — every rule the ball and robot actually obey each simulated moment."
    >
      <FormulaBlock
        id="prng"
        eyebrow={SRC}
        title="Deterministic PRNG (mulberry32)"
        formula="\begin{aligned} a &\leftarrow (a + \mathtt{0x6D2B79F5}) \bmod 2^{32} \\ t &\leftarrow \big(a \oplus (a \ggg 15)\big) \cdot (a \mid 1) \bmod 2^{32} \\ t &\leftarrow \Big(t + \big(t \oplus (t \ggg 7)\big)\cdot(t \mid 61)\Big) \oplus t \bmod 2^{32} \\ \text{next}() &= \frac{\big(t \oplus (t \ggg 14)\big) \bmod 2^{32}}{2^{32}} \end{aligned}"
        variables={[
          { symbol: "a", meaning: "The generator's internal 32-bit state — seeded once, then overwritten on every call." },
          { symbol: "t", meaning: "A scratch value used partway through scrambling the state." },
          { symbol: "\\oplus", meaning: "Bitwise XOR." },
          { symbol: "\\ggg", meaning: "Unsigned right bit-shift." },
          { symbol: "\\text{next}()", meaning: "The returned number, squeezed into the range [0, 1)." },
        ]}
        points={[
          "Starts from one 32-bit number (the seed) and scrambles it with shifts, XORs, and multiplies.",
          "Every call mutates the same state, so the output sequence keeps moving instead of repeating.",
          "The last line just rescales the scrambled integer down to a fraction between 0 and 1.",
          "No real randomness anywhere — a fixed, repeatable recipe, which is exactly why the same seed reproduces the same run byte-for-byte.",
        ]}
        note="Try it: pick a seed, draw a sequence, then draw again without changing the seed — the bars are identical."
        viz={<PrngViz />}
      />

      <FormulaBlock
        id="gaussian-noise"
        eyebrow={SRC}
        title="Gaussian noise (Box–Muller)"
        formula="z = \sqrt{-2\ln u}\,\cos(2\pi v)"
        variables={[
          { symbol: "u, v", meaning: "Two independent uniform numbers between 0 and 1, drawn from the PRNG above." },
          { symbol: "z", meaning: "One bell-curve-shaped random number, centred on 0." },
        ]}
        points={[
          "Takes two flat, equally-likely-anywhere random numbers and reshapes them into one bell-curve number.",
          "Outputs land close to 0 most of the time — the further from 0, the rarer the value gets.",
          "No separate randomness source: z is built entirely out of u and v by this one formula.",
          "Used anywhere the sim wants realistic-feeling noise instead of flat noise — kick-direction scatter, ball-position jitter.",
        ]}
        viz={<GaussianViz />}
      />

      <FormulaBlock
        id="speed-cap"
        eyebrow={SRC}
        title="Commanded-speed cap"
        formula="(v_x, v_y) \leftarrow \frac{v_{\max}}{\sqrt{v_x^2+v_y^2}}\,(v_x, v_y) \quad \text{if } \sqrt{v_x^2+v_y^2} > v_{\max}"
        variables={[
          { symbol: "v_x, v_y", meaning: "Commanded forward/sideways speed, in the robot's own frame." },
          { symbol: "v_{\\max}", meaning: "The configured top walk speed." },
        ]}
        points={[
          "Combines forward and sideways speed into one number with Pythagoras — the actual resultant speed.",
          "Over the limit, both components get multiplied by the same fraction (limit ÷ actual speed).",
          "Scaling both by the same number keeps the direction exactly the same — only the vector's length shrinks.",
          "Under the limit, this is a no-op: nothing changes at all.",
        ]}
        viz={<SpeedCapViz />}
      />

      <FormulaBlock
        id="rate-limit"
        eyebrow={SRC}
        title="Bounded-acceleration rate limiting"
        formula="v \leftarrow \operatorname{clamp}\big(v_{\text{target}},\; v-a_{\max}\,dt,\; v+a_{\max}\,dt\big)"
        variables={[
          { symbol: "v", meaning: "Whichever velocity component is being updated this tick." },
          { symbol: "v_{\\text{target}}", meaning: "That component's freshly commanded value." },
          { symbol: "a_{\\max}", meaning: "The matching acceleration limit." },
          { symbol: "dt", meaning: "The fixed tick length, 0.01 s." },
        ]}
        points={[
          "Works out how far the current speed could possibly move this one tick — plus or minus max acceleration times tick length.",
          "If the target sits inside that reachable window, jump straight to it.",
          "If not, move exactly to the edge of the window and stop there for this tick — no further.",
          "Run three times per tick, independently, for forward speed, sideways speed, and turn speed.",
        ]}
        note="A bigger jump in target speed never arrives sooner than a smaller one — the ceiling is fixed, not the travel time."
        viz={<RateLimitViz />}
      />

      <FormulaBlock
        id="frame-integration"
        eyebrow={SRC}
        title="Robot-frame → field-frame integration"
        formula="\begin{aligned} x &\leftarrow x + (v_x\cos\theta - v_y\sin\theta)\,dt \\ y &\leftarrow y + (v_x\sin\theta + v_y\cos\theta)\,dt \\ \theta &\leftarrow \operatorname{atan2}\!\big(\sin(\theta+\dot\theta\,dt),\ \cos(\theta+\dot\theta\,dt)\big) \end{aligned}"
        variables={[
          { symbol: "x, y", meaning: "The robot's field position." },
          { symbol: "\\theta", meaning: "The robot's heading (0 = facing +x)." },
          { symbol: "v_x, v_y", meaning: "The robot's own forward/sideways speed, already rate-limited." },
          { symbol: "\\dot\\theta", meaning: "Turning speed." },
        ]}
        points={[
          "The robot only knows forward/sideways relative to which way it's facing — not relative to the field's fixed x/y.",
          "Rotating that pair by the current heading is what converts \"forward speed\" into \"how much field-x, how much field-y.\"",
          "Multiplying by the tick length turns a speed into a distance, which then just gets added to the position.",
          "Heading is nudged by turn-speed × tick length, then re-wrapped through atan2 so it never drifts outside a clean range.",
        ]}
        viz={<FrameIntegrationViz />}
      />

      <FormulaBlock
        id="ball-roll"
        eyebrow={SRC}
        title="Ball rolling resistance"
        formula="\lVert v_{\text{ball}}\rVert \leftarrow \max\!\big(0,\ \lVert v_{\text{ball}}\rVert - a_{\text{ball}}\,dt\big),\qquad v_{\text{ball}} \leftarrow \begin{cases} 0 & \lVert v_{\text{ball}}\rVert < v_{\text{stop}} \\[2pt] \dfrac{v_{\text{ball}}}{\lVert v_{\text{ball}}\rVert_{\text{old}}}\,\lVert v_{\text{ball}}\rVert & \text{otherwise} \end{cases}"
        variables={[
          { symbol: "v_{\\text{ball}}", meaning: "The ball's velocity vector." },
          { symbol: "a_{\\text{ball}}", meaning: "Fixed rolling deceleration." },
          { symbol: "v_{\\text{stop}}", meaning: "Speed below which the ball just counts as stopped." },
        ]}
        points={[
          "Speed (not direction) drops by a fixed amount every tick — the same idea as a car braking at a steady rate.",
          "Direction is untouched by this formula alone; only the magnitude shrinks.",
          "Once the shrinking speed would dip under a small threshold, it's snapped straight to zero instead of crawling forever.",
          "A straight-line decay like this always reaches exactly zero in finite time — unlike the exponential decays later in this page.",
        ]}
        viz={<BallRollViz />}
      />

      <FormulaBlock
        id="kick-impulse"
        eyebrow={SRC}
        title="Foot/ball contact and kick impulse"
        formula={[
          "\\text{foot} = \\big(x + f\\cos\\theta - \\ell\\sin\\theta,\\ \\ y + f\\sin\\theta + \\ell\\cos\\theta\\big)",
          "v_{\\text{foot}} = \\big(v_x\\cos\\theta - v_y\\sin\\theta - \\dot\\theta\\,(\\text{foot}_y-y),\\ \\ v_x\\sin\\theta + v_y\\cos\\theta + \\dot\\theta\\,(\\text{foot}_x-x)\\big)",
          "c = (v_{\\text{foot}} - v_{\\text{ball}}) \\cdot \\hat n",
          "\\begin{aligned} \\phi &= \\operatorname{atan2}(\\hat n_y,\\hat n_x) + z\\,\\sigma_{\\text{dir}} + b_{\\text{dir}}, \\qquad z \\sim \\mathcal N(0,1) \\\\ s &= c \\cdot k_{\\text{kick}} \\cdot \\big(1 + u\\,j_{\\text{speed}}\\big), \\qquad u \\sim \\mathcal U(-1,1) \\\\ v_{\\text{ball}} &= \\big(s\\cos\\phi,\\ s\\sin\\phi\\big) \\end{aligned}",
        ]}
        variables={[
          { symbol: "f, \\ell", meaning: "Fixed forward/sideways offset from the robot's centre to its kicking foot." },
          { symbol: "\\hat n", meaning: "Unit vector from the foot to the ball at the moment of contact." },
          { symbol: "c", meaning: "Closing speed of the foot onto the ball, along that contact-normal direction." },
          { symbol: "\\phi, s", meaning: "The outgoing kick direction and speed." },
          { symbol: "\\sigma_{\\text{dir}}, b_{\\text{dir}}", meaning: "Random scatter size and a fixed systematic bias on the direction." },
          { symbol: "k_{\\text{kick}}, j_{\\text{speed}}", meaning: "Fixed kick-gain multiplier and a random speed-jitter fraction." },
        ]}
        points={[
          "The kicking foot isn't the robot's centre — it's placed a fixed distance ahead and to one side, matching a real stride.",
          "Because the foot also carries the robot's own spin, its velocity is \"walking forward\" plus \"sweeping around,\" added together.",
          "Closing speed only counts the part of the foot's motion aimed straight at the ball — a graze doesn't count.",
          "A strike only actually fires once that closing speed passes a small threshold, so a graze doesn't launch the ball.",
          "The outgoing direction is the contact direction, nudged by random scatter and a small fixed bias — no kick is perfectly aimed.",
          "The outgoing speed scales with the foot's closing speed, multiplied up by a fixed gain, plus its own random jitter.",
        ]}
        note="Default constants: kickGain 3.0, ~8° of scatter, a 0.06 rad systematic bias, and ±20% speed jitter."
        viz={<KickImpulseViz />}
      />

      <FormulaBlock
        id="torso-collision"
        eyebrow={SRC}
        title="Torso (body) collision"
        formula={[
          "\\hat n = \\frac{p_{\\text{ball}}-p_{\\text{robot}}}{\\lVert p_{\\text{ball}}-p_{\\text{robot}}\\rVert}, \\qquad p_{\\text{ball}} \\leftarrow p_{\\text{robot}} + \\hat n\\,(r_{\\text{ball}}+r_{\\text{robot}})",
          "c = v_{\\text{robot}}\\cdot\\hat n, \\qquad v_{\\text{ball}} \\leftarrow \\begin{cases} \\hat n\\, c & c>0 \\\\ v_{\\text{ball}} & \\text{otherwise} \\end{cases}",
        ]}
        variables={[
          { symbol: "p_{\\text{robot}}, p_{\\text{ball}}", meaning: "Robot and ball field positions." },
          { symbol: "\\hat n", meaning: "Unit vector from robot centre to ball centre." },
          { symbol: "r_{\\text{ball}}, r_{\\text{robot}}", meaning: "Ball and robot collision radii." },
          { symbol: "c", meaning: "How much of the robot's own velocity is aimed straight at the ball." },
        ]}
        points={[
          "Only fires in a cone behind and to the sides of the robot — a ball out front is always the foot's job, not the torso's.",
          "The two circles are pushed apart along the line between their centres until they just touch, nothing more.",
          "If the robot's own velocity is carrying it into the ball, the ball is handed exactly that inward component — redirected outward along the same line.",
          "If the robot is just resting against the ball rather than driving into it, its velocity is left alone entirely.",
          "Notice what's missing next to the kick formula above: no gain multiplier, no random scatter, no speed threshold. A shove, not a strike.",
        ]}
        viz={<TorsoCollisionViz />}
      />

      <FormulaBlock
        id="termination"
        eyebrow={SRC}
        title="Termination geometry"
        formula="\text{goal} \iff x>\tfrac{L}{2} \wedge |y|<\tfrac{G}{2}, \qquad \text{out} \iff |x|>\tfrac{L}{2}+r_{\text{ball}} \vee |y|>\tfrac{W}{2}+r_{\text{ball}}"
        variables={[
          { symbol: "x, y", meaning: "The ball's field position." },
          { symbol: "L, W", meaning: "Full field length and width." },
          { symbol: "G", meaning: "Goal-mouth width." },
          { symbol: "r_{\\text{ball}}", meaning: "Ball radius." },
        ]}
        points={[
          "Checked fresh every tick from the ball's current position alone — its speed and history don't matter.",
          "\"Goal\" needs both conditions at once: past the goal line, and still between the posts. Past the line but wide of the posts isn't a goal.",
          "\"Out\" only fires once the ball has fully crossed a boundary by its own radius, not the instant its centre reaches the line.",
          "An own-goal is the exact same check mirrored at the robot's own end of the pitch.",
        ]}
        viz={<TerminationViz />}
      />

      <FormulaBlock
        id="frame-transform"
        eyebrow={SRC}
        title="Field → robot-frame transform"
        formula="\begin{pmatrix}x'\\y'\end{pmatrix} = \begin{pmatrix}\cos\theta & \sin\theta\\-\sin\theta & \cos\theta\end{pmatrix} \begin{pmatrix}x_{\text{ball}}-x_{\text{robot}}\\y_{\text{ball}}-y_{\text{robot}}\end{pmatrix}, \qquad \text{range}=\sqrt{x'^2+y'^2},\quad \text{yaw}=\operatorname{atan2}(y',x')"
        variables={[
          { symbol: "(x_{\\text{ball}},y_{\\text{ball}})", meaning: "Ball's field position." },
          { symbol: "(x_{\\text{robot}},y_{\\text{robot}})", meaning: "Robot's field position." },
          { symbol: "(x',y')", meaning: "The ball's position, re-expressed relative to the robot." },
        ]}
        points={[
          "A standard 2D rotation matrix, built from the sine and cosine of the robot's current heading.",
          "Rotating \"backward\" by the robot's own heading is exactly what turns a field-relative offset into a robot-relative one.",
          "Range is just Pythagoras on the rotated coordinates — rotating a point never changes its distance from the origin, so this always agrees with computing range in field coordinates directly.",
          "Yaw is the bearing the robot itself would perceive: 0° dead ahead, positive off to one side.",
        ]}
        viz={<FrameTransformViz />}
      />
    </SimMathSection>
  );
}
