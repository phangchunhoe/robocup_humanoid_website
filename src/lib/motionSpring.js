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
