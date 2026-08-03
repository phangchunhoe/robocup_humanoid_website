import "./ProgressBar.css";

/**
 * Thin setup-progress bar: accent fill on an elevated track, with a legible
 * label row above it. Deliberately minimal — no numerals inside the bar, no
 * step chrome (see CLAUDE.md).
 *
 * `surface` gives it the raised panel treatment, for use as a step header
 * sitting on the canvas.
 *
 * @param {number} value - completed units
 * @param {number} max - total units
 * @param {boolean} surface
 */
export default function ProgressBar({ value, max, label, hint, surface = false }) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));

  return (
    <div className={`progress${surface ? " progress-surface" : ""}`}>
      <div className="progress-row">
        <span className="progress-label">{label}</span>
        {hint ? <span className="progress-hint">{hint}</span> : null}
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <div className="progress-fill" style={{ transform: `scaleX(${ratio})` }} />
      </div>
    </div>
  );
}
