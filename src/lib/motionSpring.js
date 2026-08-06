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
