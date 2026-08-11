import "./CollapsibleSection.css";

// A standard inline disclosure — closed by default, pushes content below it
// down rather than overlaying it. Same shape as RobotSimulator's own
// diagnostics disclosure (CLAUDE.md → Components → Collapsible diagnostics
// summary), generalized so any page can reuse it for "more detail on demand".
export default function CollapsibleSection({ summary, children, className = "" }) {
  return (
    <details className={`collapsible-section${className ? ` ${className}` : ""}`}>
      <summary>
        {summary}
        <svg
          className="collapsible-chevron"
          viewBox="0 0 12 12"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}
