// The ball-tip marker's artwork is referenced from ProgressBar.css rather
// than imported here, since the CSS also owns the geometry that depends on
// it (the ring overlapping its edge). It is the full 512px source, scaled
// down by the browser at paint time rather than by a build step — the mark
// renders at 20px, so the extra resolution buys nothing below a 25×
// display, but it does keep one asset on disk instead of a source and a
// derivative that can drift apart.
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
 * sitting on the canvas. `ballTip` swaps the plain lead tick for a small
 * soccer-ball glyph centered on the fill's tip — see CLAUDE.md → Components,
 * the robot-simulator route's ball-tip progress bar.
 *
 * @param {number} value - completed units
 * @param {number} max - total units
 * @param {string} label - the instrument marking, rendered uppercase
 * @param {string} hint - the live readout, rendered in --font-mono
 * @param {boolean} surface
 * @param {boolean} ballTip
 */
export default function ProgressBar({ value, max, label, hint, surface = false, ballTip = false }) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const complete = ratio >= 1;
  // The lead edge is a position marker, so it only means anything while the
  // bar is genuinely mid-way — at either end there is nothing to lead. The
  // ball tip has no such idle state: even at 0 it is meaningful, marking the
  // not-yet-started tip of the fill.
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
        className={`progress-track${ballTip ? " has-ball" : ""}`}
        style={{ "--progress-ratio": ratio }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-label={label}
      >
        <div className="progress-fill" />
        {ballTip ? (
          <div className="progress-ball" aria-hidden="true">
            {/* An empty span, not an <img>: the ring drawn around the ball
                has to paint over the artwork's outer edge, and a replaced
                element's content box stops at the border. So the artwork is
                a background layer — see .progress-ball-face. It is purely
                decorative anyway, restating the readout beside it. */}
            <span className="progress-ball-face" />
          </div>
        ) : (
          <div className={`progress-lead${leadIdle ? " is-idle" : ""}`} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
