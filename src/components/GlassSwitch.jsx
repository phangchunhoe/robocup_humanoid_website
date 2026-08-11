import "./GlassSwitch.css";

/**
 * A binary liquid-glass toggle — track plus a sliding thumb, for a genuine
 * on/off control. Distinct from GlassButton's `selected` prop, which stands
 * in for one option among a set (CLAUDE.md -> Components -> Glass button);
 * this is the pattern for a single boolean.
 *
 * A real <button role="switch" aria-checked> — the whole track is the hit
 * target (clicking anywhere on it toggles, not just the thumb), and
 * Enter/Space work for free. No visible label of its own, so a caller
 * placing this next to plain text (as ApproachKickTestFlow.jsx does) should
 * still pass `aria-label` — the visible text sits in its own element, not
 * this control's accessible name, the same reason a corner icon button
 * needs one.
 */
export default function GlassSwitch({ checked, onChange, className = "", ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`glass-switch${checked ? " is-on" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="glass-switch-track">
        <span className="glass-switch-thumb" />
      </span>
    </button>
  );
}
