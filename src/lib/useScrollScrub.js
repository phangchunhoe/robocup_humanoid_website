// Shared scroll-scrub engine: eases a progress value toward a scroll-derived
// target using an exponential approach, rather than pinning it frame-exact to
// the wheel. See CLAUDE.md's Motion section — a scrub reads as physical only
// if it trails the input by a beat, the same way hover/press states
// transition instead of swapping instantly.
//
// Two call sites share this: the landing page's hero shot (HeroField.jsx)
// and the simulator's physics drawer (RobotSimulator.jsx). Keep both on this
// one implementation rather than letting the algorithm drift between them.

import { useEffect, useRef } from "react";

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

    const tauRaw = window.getComputedStyle(tauEl).getPropertyValue("--duration-base");
    const parsed = parseFloat(tauRaw);
    const tau = Number.isFinite(parsed) && parsed > 0
      ? (tauRaw.trim().endsWith("ms") ? parsed : parsed * 1000)
      : 300;

    let shown = getTargetRef.current();
    let target = shown;
    let frame = 0;
    let previous = 0;

    const tick = (now) => {
      // Exponential approach: the step is a fraction of the remaining gap, so
      // it eases out on its own, never overshoots, and behaves the same at any
      // refresh rate. Clamped because a backgrounded tab hands back one huge
      // delta, which would otherwise snap the value across its whole range.
      const elapsed = previous ? Math.min(now - previous, 100) : 0;
      previous = now;
      shown += (target - shown) * (1 - Math.exp(-elapsed / tau));
      // It approaches without ever arriving; cut it off below a sub-pixel gap
      // so the loop can actually stop.
      if (Math.abs(target - shown) < 0.0005) shown = target;
      onFrameRef.current(shown);
      if (shown === target) {
        frame = 0;
        previous = 0;
      } else {
        frame = window.requestAnimationFrame(tick);
      }
    };

    // Scroll fires far more often than the display refreshes, so it only ever
    // moves the target — tick() is what writes out a value, once a frame and
    // only while there is a gap left to close.
    const schedule = () => {
      target = getTargetRef.current();
      if (!frame) frame = window.requestAnimationFrame(tick);
    };

    onFrameRef.current(shown);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, tauRef]);
}
