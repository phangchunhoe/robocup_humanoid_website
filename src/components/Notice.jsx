import StatusIndicator from "./StatusIndicator.jsx";
import "./Notice.css";

/**
 * A status headline with optional explanatory body beneath it.
 *
 * Used where a bare StatusIndicator isn't enough because the state needs
 * explaining (a parse failure, a missing header). Carries no filled
 * background and no colored border — the status color lives in the dot or
 * checkmark and nowhere else, per the status rule in CLAUDE.md.
 *
 * @param {"success"|"error"|"muted"} tone
 */
export default function Notice({ tone = "muted", title, children }) {
  return (
    <div className="notice">
      <StatusIndicator tone={tone} label={title} />
      {children ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}
