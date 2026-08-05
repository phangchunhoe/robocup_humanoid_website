import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING_UI } from "../lib/motionSpring.js";
import "./RoleToggle.css";

/**
 * A single connected segmented toggle with a sliding selected-state pill —
 * the spring-based translation of the reference progress-indicator's
 * motion.div step overlay (see CLAUDE.md -> Motion -> Spring-based
 * controls). Unlike that reference, which animated between fixed per-step
 * pixel widths, the pill here is measured off the real button DOM on every
 * selection change, since these labels ("Striker" / "Goalkeeper") are
 * organic text rather than a fixed step count — that keeps `tokens.css`
 * free of a hardcoded width for what is fundamentally a layout fact, not a
 * design value.
 *
 * Native radio semantics still drive the state: `role="radiogroup"` and
 * `role="radio"`/`aria-checked` on each segment, so keyboard and
 * screen-reader behavior come for free the same way SelectableCard's
 * hidden `<input type="radio">` did.
 *
 * @param {{id: string, label: string}[]} options
 */
export default function RoleToggle({ options, value, onChange, legend }) {
  const trackRef = useRef(null);
  const segmentRefs = useRef({});
  const [pill, setPill] = useState(null);
  // framer-motion's own reduced-motion signal, same media query the rest of
  // the page's CSS answers — the pill jumps instead of springing.
  const reduceMotion = useReducedMotion();

  const measure = () => {
    const track = trackRef.current;
    const el = segmentRefs.current[value];
    if (!track || !el) return;
    const trackBox = track.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    // getBoundingClientRect gives the track's BORDER box, but the pill is
    // absolutely positioned and so resolves its offsets against the track's
    // PADDING box — subtract the border (clientLeft) or the pill lands one
    // hairline to the right of the segment it is meant to cover. Invisible
    // while this was a borderless 980px capsule; not once it became a
    // squared-off pane carrying a hairline of its own.
    setPill({
      x: elBox.left - trackBox.left - track.clientLeft,
      width: elBox.width,
      height: elBox.height,
    });
  };

  // Re-measure on selection change, on first mount, and on resize — the
  // pill has to track real layout, not a value computed once.
  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options.length]);

  // Space Grotesk is self-hosted with font-display: swap (see CLAUDE.md ->
  // Typography), so the segments can render their labels in the fallback
  // face first and reflow once the real font lands. getBoundingClientRect
  // above only ever captures whatever is laid out *right now* — if that
  // measurement happens before the swap, the pill is sized to the fallback
  // font's metrics and stays stranded there until the next selection change
  // triggers the effect above. document.fonts.ready re-measures once the
  // swap has actually landed. measureRef holds the latest closure (bound to
  // the current `value`) since this effect only runs once, on mount, but
  // must still call whatever measure is current by the time the promise
  // resolves.
  const measureRef = useRef(measure);
  useEffect(() => {
    measureRef.current = measure;
  });
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return undefined;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measureRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The cursor-following hover highlight. Writing the pointer position to two
  // custom properties on the segment itself keeps this off React's render
  // path — a mousemove-driven setState would re-render the whole toggle on
  // every frame of a pointer sweep. The gradient that reads them lives in
  // RoleToggle.css; only its opacity transitions, the position tracks live.
  const handleMouseMove = (evt) => {
    const el = evt.currentTarget;
    const box = el.getBoundingClientRect();
    el.style.setProperty("--mouse-x", `${evt.clientX - box.left}px`);
    el.style.setProperty("--mouse-y", `${evt.clientY - box.top}px`);
  };

  const handleKeyDown = (evt) => {
    const ids = options.map((o) => o.id);
    const i = ids.indexOf(value);
    let next = null;
    if (evt.key === "ArrowRight" || evt.key === "ArrowDown") {
      next = ids[i >= ids.length - 1 ? 0 : i + 1];
    } else if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") {
      next = ids[i <= 0 ? ids.length - 1 : i - 1];
    }
    if (!next) return;
    evt.preventDefault();
    onChange(next);
    segmentRefs.current[next]?.focus();
  };

  return (
    <fieldset className="role-toggle">
      {legend ? <legend className="role-toggle-legend">{legend}</legend> : null}
      <div
        className="role-toggle-track"
        ref={trackRef}
        role="radiogroup"
        aria-label={legend}
        onKeyDown={handleKeyDown}
      >
        {pill ? (
          <motion.div
            className="role-toggle-pill"
            animate={{ x: pill.x, width: pill.width, height: pill.height }}
            transition={reduceMotion ? { duration: 0 } : SPRING_UI}
          />
        ) : null}
        {options.map((option) => {
          const active = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              ref={(el) => {
                segmentRefs.current[option.id] = el;
              }}
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className={`role-toggle-segment${active ? " is-active" : ""}`}
              onClick={() => onChange(option.id)}
              onMouseMove={handleMouseMove}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
