import StatusIndicator from "./StatusIndicator.jsx";
import "./Notice.css";

/**
 * A status headline with optional explanatory body beneath it.
 *
 * Used where a bare StatusIndicator isn't enough because the state needs
 * explaining (a parse failure, a missing header). Carries no filled
 * background and no colored border — the status color lives in the title and
 * nowhere else, per the status rule in CLAUDE.md.
 *
 * `glyph={false}` drops the leading dot and un-indents the body, for panels
 * that carry status in color alone.
 *
 * @param {"success"|"error"|"muted"} tone
 * @param {boolean} glyph
 */
export default function Notice({ tone = "muted", title, children, glyph = true }) {
  return (
    <div className={`notice${glyph ? "" : " notice-bare"}`}>
      <StatusIndicator tone={tone} label={title} glyph={glyph} />
      {children ? <div className="notice-body">{children}</div> : null}
    </div>
  );
}
