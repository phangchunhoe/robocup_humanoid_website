import "./StatusIndicator.css";

/**
 * Minimal status marker: a small dot (or checkmark for success) plus a short
 * text label. Deliberately has no badge chrome — no filled pill, no border,
 * no uppercase micro-label (see CLAUDE.md).
 *
 * @param {"success"|"error"|"muted"} tone
 */
export default function StatusIndicator({ tone = "muted", label, animateKey }) {
  return (
    <span className={`status status-${tone}`} key={animateKey}>
      {tone === "success" ? (
        <svg
          className="status-glyph"
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 6.4l2.3 2.3 4.7-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span className="status-dot" aria-hidden="true" />
      )}
      <span className="status-label">{label}</span>
    </span>
  );
}
