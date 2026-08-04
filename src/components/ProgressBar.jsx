import "./ProgressBar.css";

/**
 * Technical HUD status indicator: an etched hairline track, a glowing lead
 * edge riding the head of the fill, and a monospace live readout. Not a
 * generic progress bar — no numerals inside the bar, no step chrome (see
 * CLAUDE.md → Components).
 *
 * Fill and lead edge are both driven from the single `--progress-ratio`
 * custom property set on the track, so there is one source of truth for the
 * position and the two marks cannot drift apart.
 *
 * `surface` gives it the raised panel treatment, for use as a step header
 * sitting on the canvas.
 *
 * @param {number} value - completed units
 * @param {number} max - total units
 * @param {string} label - the instrument marking, rendered uppercase
 * @param {string} hint - the live readout, rendered in --font-mono
 * @param {boolean} surface
 */
export default function ProgressBar({ value, max, label, hint, surface = false }) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const complete = ratio >= 1;
  // The lead edge is a position marker, so it only means anything while the
  // bar is genuinely mid-way — at either end there is nothing to lead.
  const leadIdle = ratio <= 0 || complete;

  return (
    <div className={`progress${surface ? " progress-surface" : ""}`}>
      <div className="progress-row">
        <span className="progress-label">{label}</span>
        {hint ? (
          <span className={`progress-readout${complete ? " is-complete" : ""}`}>{hint}</span>
        ) : null}
      </div>
      <div
        className="progress-track"
        style={{ "--progress-ratio": ratio }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <div className="progress-fill" />
        <div className={`progress-lead${leadIdle ? " is-idle" : ""}`} aria-hidden="true" />
      </div>
    </div>
  );
}
