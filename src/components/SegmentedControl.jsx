import "./SegmentedControl.css";

/**
 * Apple-style segmented control: pill-shaped track, one accent-filled active
 * segment. Used wherever a view or mode is switched (see CLAUDE.md) — this is
 * the project's tab pattern; there is no underlined tab bar.
 *
 * Implements the WAI-ARIA tabs keyboard contract (arrow keys move and select,
 * Home/End jump to the ends) so it behaves like a real tablist, not a row of
 * buttons. Pair with `panelId`/`id` when it controls a panel.
 *
 * @param {{id: string, label: string}[]} segments
 * @param {string} value - id of the active segment
 */
export default function SegmentedControl({
  segments,
  value,
  onChange,
  ariaLabel,
  size = "md",
}) {
  const activeIndex = segments.findIndex((s) => s.id === value);

  const handleKeyDown = (evt) => {
    const lastIndex = segments.length - 1;
    let nextIndex = null;
    if (evt.key === "ArrowRight" || evt.key === "ArrowDown") {
      nextIndex = activeIndex >= lastIndex ? 0 : activeIndex + 1;
    } else if (evt.key === "ArrowLeft" || evt.key === "ArrowUp") {
      nextIndex = activeIndex <= 0 ? lastIndex : activeIndex - 1;
    } else if (evt.key === "Home") {
      nextIndex = 0;
    } else if (evt.key === "End") {
      nextIndex = lastIndex;
    }
    if (nextIndex === null) return;
    evt.preventDefault();
    onChange(segments[nextIndex].id);
    // Move focus with selection, as the tabs pattern requires.
    const track = evt.currentTarget;
    const buttons = track.querySelectorAll("[role='tab']");
    if (buttons[nextIndex]) buttons[nextIndex].focus();
  };

  return (
    <div
      className={`segmented segmented-${size}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {segments.map((segment) => {
        const active = segment.id === value;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            id={segment.id ? `segment-${segment.id}` : undefined}
            aria-selected={active}
            aria-controls={segment.panelId}
            tabIndex={active ? 0 : -1}
            className={`segmented-segment${active ? " is-active" : ""}`}
            onClick={() => onChange(segment.id)}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
