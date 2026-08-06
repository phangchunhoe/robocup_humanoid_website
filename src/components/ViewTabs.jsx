import "./ViewTabs.css";

/**
 * A bordered top-tab bar: squared, individually-outlined tabs sharing one
 * full-width hairline beneath them, the active tab reading as the same glass
 * "active segment" chrome `SegmentedControl` uses (see CLAUDE.md ->
 * Components -> Segmented control) — this is a second, named tab shape for a
 * view switch that wants that boxed-tab reading rather than a pill track.
 *
 * Same WAI-ARIA tabs keyboard contract as `SegmentedControl`: arrow keys
 * move and select, Home/End jump to the ends.
 *
 * @param {{id: string, label: string}[]} tabs
 * @param {string} value - id of the active tab
 */
export default function ViewTabs({ tabs, value, onChange, ariaLabel }) {
  const activeIndex = tabs.findIndex((t) => t.id === value);

  const handleKeyDown = (evt) => {
    const lastIndex = tabs.length - 1;
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
    onChange(tabs[nextIndex].id);
    const track = evt.currentTarget;
    const buttons = track.querySelectorAll("[role='tab']");
    if (buttons[nextIndex]) buttons[nextIndex].focus();
  };

  return (
    <div className="view-tabs" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`view-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={tab.panelId}
            tabIndex={active ? 0 : -1}
            className={`view-tabs-tab${active ? " is-active" : ""}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
