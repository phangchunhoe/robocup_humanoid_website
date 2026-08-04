/*
 * Landing-route hero: a striker kicking into the opponent goal.
 *
 * Decorative atmosphere, not content — it is aria-hidden and never takes a
 * pointer event. It replaces the product-image hero, so it follows the same
 * rules (sits on the canvas, no card/border/shadow, enters last) with one
 * addition: it is fixed to the right of the viewport and the shot is scrubbed
 * by page scroll, so the ball travels into the goal as the page moves under it.
 *
 * Geometry is drawn at the simulator's own scale — 60 px/m, +x toward the
 * opponent goal — but the viewBox shows only the attacking third, from just
 * behind the halfway line to the back of the net, so the subject fills a tall
 * slot:
 *   sx = (x + 1.6) * 60      sy = (5 - y) * 60
 *
 * The ball is placed by measuring the trajectory path itself rather than by
 * repeating its curve in CSS, so the two can never disagree about where the
 * ball is. Scroll does not place it directly — useScrollScrub (src/lib) eases
 * a target toward the ball, so the shot trails the wheel instead of being
 * pinned to it. That eased value is also published as --rs-kick (0 -> 1) on
 * the container, for the parts of the shot that are pure styling; see
 * RobotSimulator.css.
 */

import { useRef } from "react";
import { useScrollScrub } from "../lib/useScrollScrub.js";

export default function HeroField() {
  const rootRef = useRef(null);
  const pathRef = useRef(null);
  const ballRef = useRef(null);
  // Path length in user units — constant, so it is measured once. It reads 0
  // while the field is display:none (below the 900px breakpoint), hence the
  // lazy read: the first frame after it comes back picks the real value up.
  const lengthRef = useRef(0);

  const getTarget = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    const range = document.documentElement.scrollHeight - window.innerHeight;
    if (range <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / range));
  };

  const onFrame = (progress) => {
    const root = rootRef.current;
    const path = pathRef.current;
    const ball = ballRef.current;
    if (!root || !path || !ball) return;
    if (!lengthRef.current) {
      lengthRef.current = path.getTotalLength();
      if (!lengthRef.current) return;
      path.style.strokeDasharray = lengthRef.current;
    }
    const length = lengthRef.current;
    const point = path.getPointAtLength(length * progress);
    ball.setAttribute("cx", point.x);
    ball.setAttribute("cy", point.y);
    // The trajectory draws itself in behind the ball.
    path.style.strokeDashoffset = length * (1 - progress);
    root.style.setProperty("--rs-kick", progress.toFixed(4));
  };

  useScrollScrub(rootRef, getTarget, onFrame);

  return (
    <div className="rs-hero-field" ref={rootRef} aria-hidden="true">
      <svg viewBox="0 0 580 600" preserveAspectRatio="xMaxYMid meet" focusable="false">
        {/* --- pitch markings: quiet hairlines, the same value as any other
            separator on the page, so the field reads as ground rather than as
            a diagram competing with the form. --- */}
        <g className="rs-field-lines">
          {/* Touch lines running into the goal line. */}
          <path d="M 0 30 H 516 V 570 H 0" />
          {/* Halfway line and centre circle, cropped by the left edge. */}
          <path d="M 96 30 V 570" />
          <circle cx="96" cy="300" r="90" />
          {/* Penalty area, then goal area. */}
          <path d="M 516 120 H 336 V 480 H 516" />
          <path d="M 516 180 H 456 V 420 H 516" />
        </g>
        <g className="rs-field-marks">
          <circle cx="96" cy="300" r="3" />
          <circle cx="390" cy="300" r="3" />
        </g>

        {/* --- the goal: net box, hatching, and the mouth itself --- */}
        <g className="rs-field-goal">
          <path d="M 516 222 H 552 V 378 H 516" />
          <path className="rs-field-net" d="M 528 222 V 378 M 540 222 V 378" />
        </g>
        <path className="rs-field-mouth" d="M 516 222 V 378" />

        {/* The shot: from the striker's foot, curling to the far side of the
            goal. This is the single source of truth for where the ball is. */}
        <path className="rs-shot-line" ref={pathRef} d="M 230 359 Q 405 288 537 246" />

        {/* The striker, rotated onto the shot's opening tangent so the body,
            the kicking foot, and the ball all point at the same place. */}
        <g className="rs-striker" transform="translate(192 372) rotate(-22)">
          <rect x="-12" y="-16" width="24" height="32" rx="9" />
          <circle className="rs-striker-head" cx="2" cy="0" r="8" />
          <path d="M 8 6 L 24 3 M 6 -8 L 16 -12" />
          <circle cx="27" cy="2" r="5" />
          <circle cx="18" cy="-13" r="4" />
        </g>

        {/* Net ripple — the payoff, and the only thing that appears rather than
            moves. It is held back until the ball is all but in. */}
        <path className="rs-net-ripple" d="M 545 232 Q 552 246 545 260" />

        {/* Positioned from the path above on every frame. */}
        <circle className="rs-ball" ref={ballRef} r="7" />
      </svg>
    </div>
  );
}
