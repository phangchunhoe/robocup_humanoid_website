import "./SelectableCard.css";

/**
 * Radio group rendered as selectable cards. Selection reads as an accent
 * border plus an accent check — no white box, no heavy chrome (see CLAUDE.md).
 *
 * Native radio inputs do the state and keyboard work; the visible card is the
 * label, so arrow-key navigation and screen-reader semantics come for free.
 *
 * @param {{id: string, label: string, detail?: string}[]} options
 */
export default function SelectableCard({ name, options, value, onChange, legend }) {
  return (
    <fieldset className="cards">
      {legend ? <legend className="cards-legend">{legend}</legend> : null}
      <div className="cards-row">
        {options.map((option) => {
          const selected = option.id === value;
          return (
            <label
              key={option.id}
              className={`card${selected ? " is-selected" : ""}`}
              htmlFor={`${name}-${option.id}`}
            >
              <input
                type="radio"
                id={`${name}-${option.id}`}
                name={name}
                value={option.id}
                checked={selected}
                onChange={() => onChange(option.id)}
                className="card-input"
              />
              <span className="card-body">
                <span className="card-label">{option.label}</span>
                {option.detail ? <span className="card-detail">{option.detail}</span> : null}
              </span>
              <span className="card-check" aria-hidden="true">
                {selected ? (
                  <svg viewBox="0 0 14 14" focusable="false">
                    <path
                      d="M3 7.4l2.6 2.6L11 4.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
