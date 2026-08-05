// Scroll-scrub: eases a progress value toward a scroll-derived target rather
// than pinning it frame-exact to the wheel. See CLAUDE.md's Motion section —
// a scrub reads as physical only if it trails the input by a beat, the same
// way hover/press states transition instead of swapping instantly.
//
// One call site: the simulator's physics drawer (RobotSimulator.jsx). The
// landing hero's shot used to share this; it is trigger-driven now (page
// entrance, then Load & Check) and takes the same easing through
// useEasedApproach instead. Both still run on the one engine in
// easedApproach.js — only what sets the target differs.

import { useEffect, useRef } from "react";
import { createApproach, readTau } from "./easedApproach.js";

/**
 * @param {React.RefObject<Element>} tauRef - element to read --duration-base
 *   from, as the easing's time constant. Must be mounted for the effect to run.
 * @param {() => number} getTarget - returns the current target progress.
 *   Responsible for its own prefers-reduced-motion handling: return a fixed
 *   resting value rather than tracking scroll, so reduced motion holds still
 *   instead of easing toward a moving target.
 * @param {(value: number) => void} onFrame - called with the eased value, once
 *   per settling frame and once more on the frame it reaches the target.
 * @param {boolean} enabled
 */
export function useScrollScrub(tauRef, getTarget, onFrame, enabled = true) {
  // rAF callbacks read these through a ref so the effect below never has to
  // list them as dependencies and tear down the scroll listener whenever a
  // parent re-render hands it a new closure.
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    const tauEl = tauRef.current;
    if (!enabled || !tauEl) return undefined;

    const approach = createApproach({
      tau: readTau(tauEl),
      initial: getTargetRef.current(),
      onFrame: (value) => onFrameRef.current(value),
    });

    // Scroll fires far more often than the display refreshes, so it only ever
    // moves the target — the engine's own loop writes a value out, once a
    // frame and only while there is a gap left to close.
    const schedule = () => approach.setTarget(getTargetRef.current());

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      approach.stop();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, tauRef]);
}
