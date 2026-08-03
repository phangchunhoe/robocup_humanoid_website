import { useEffect, useId, useRef, useState } from "react";
import "./InfoHint.css";

/**
 * Small info affordance that keeps explanatory prose out of the layout until
 * asked for — the copy discipline in CLAUDE.md leaves room for a headline and
 * a subhead only, but the detail still has to live somewhere.
 *
 * Click/Enter toggles; Escape or an outside click dismisses.
 */
export default function InfoHint({ text, label = "More information", align = "start" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (evt) => {
      if (evt.key === "Escape") setOpen(false);
    };
    const onPointerDown = (evt) => {
      if (wrapRef.current && !wrapRef.current.contains(evt.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <span className="info-hint" ref={wrapRef}>
      <button
        type="button"
        className="info-hint-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="8" cy="4.9" r="0.85" fill="currentColor" />
          <path
            d="M8 7.1v4.4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open ? (
        <span
          className={`info-hint-popover info-hint-popover-${align}`}
          id={popoverId}
          role="note"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
