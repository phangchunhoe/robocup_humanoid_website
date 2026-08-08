// Shared spring config for the framer-motion-driven controls on the
// robot-simulator route: the role toggle's sliding pill and the two-stage
// primary button's layout animation. This is a second motion system
// coexisting with the page's existing rAF/exponential-easing approach
// (useScrollScrub.js) — named and scoped deliberately rather than left
// incidental. See CLAUDE.md -> Motion for why the two are allowed to
// coexist and where each one applies.
//
// Tuned to read as snappy-but-settled: heavier damping than framer-motion's
// default keeps it from overshooting/wobbling, which would clash with the
// rest of the page's ease-out-only motion language; stiffness is high
// enough that it doesn't feel sluggish next to --duration-fast (150ms)
// press feedback happening on the same controls.
export const SPRING_UI = { type: "spring", stiffness: 500, damping: 40, mass: 0.8 };

// A third, explicitly scoped case (see CLAUDE.md -> Motion -> Spring-based
// controls): the run step's back button, whose magnetic hover pull and
// click bounce are asked to read as an elastic liquid droplet reaching for
// the cursor and springing back, not as a settled layout change. Lighter
// damping than SPRING_UI on purpose -- a controlled amount of overshoot is
// the point here rather than something to damp out.
export const SPRING_MAGNETIC = { type: "spring", stiffness: 300, damping: 18, mass: 0.6 };
// The click acknowledgment on the same button: faster and snappier than the
// hover pull (matches --duration-fast press feedback in character), with a
// touch less damping so the overshoot reads as a tactile bounce.
export const SPRING_CLICK = { type: "spring", stiffness: 700, damping: 15, mass: 0.5 };

// A fifth, explicitly scoped case: the run step's "Limit Ball Vision"
// control splitting into its three round buttons (and recombining on cancel).
// The ask was a liquid-droplet split; a true gooey SVG-blob morph would have to
// composite on top of GlassButton's own turbulence-displacement filter and
// backdrop-blur, and stacking two filters fighting for the same pixels risked
// visual mush or real compositor cost for a decorative transition -- so this is
// the named approximation instead: scale/opacity/position (each circle's `x`
// converging on/emerging from the pill's own measured centre — see
// PILL_SPLIT_ORIGIN in RobotSimulator.jsx) with a visible elastic overshoot,
// standing in for the blob separating.
//
// Expressed with framer-motion's duration/bounce spring syntax rather than
// stiffness/damping/mass, unlike this file's other springs: a first pass at
// stiffness 260/damping 20/mass 0.7 settled in ~280ms, which read as a snappy
// layout settle (in the SPRING_UI/SPRING_CLICK family) rather than the slower,
// fluid "liquid separating" motion this transition is standing in for.
// duration is picked to land in --duration-slow's (1000ms) territory — the
// same "deliberate, not snappy" pace the page's own entrance motion uses —
// and bounce keeps a real but restrained overshoot rather than a cartoonish
// wobble.
export const SPRING_SPLIT = { type: "spring", duration: 0.9, bounce: 0.32 };
