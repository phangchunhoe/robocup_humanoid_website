import "./StatusIndicator.css";

/**
 * Minimal status marker: a short text label carrying the status color, with an
 * optional small dot in front of it. Deliberately has no badge chrome — no
 * filled pill, no border, no uppercase micro-label — and no tick glyph; color
 * is what says "this passed" (see CLAUDE.md).
 *
 * Pass `glyph={false}` in a dense list of statuses, such as the parse
 * diagnostics panel, where a column of repeated dots is noise and color alone
 * reads better.
 *
 * @param {"success"|"error"|"muted"} tone
 * @param {boolean} glyph - render the leading dot
 */
export default function StatusIndicator({
  tone = "muted",
  label,
  animateKey,
  glyph = true,
}) {
  return (
    <span
      className={`status status-${tone}${glyph ? "" : " status-bare"}`}
      key={animateKey}
    >
      {glyph ? <span className="status-dot" aria-hidden="true" /> : null}
      <span className="status-label">{label}</span>
    </span>
  );
}
