// Shared section chrome — number, heading, intro, and a slot for its FormulaBlocks —
// so every one of the 7 sections on the Simulation Math page opens the same way.
export default function SimMathSection({ id, number, title, intro, children }) {
  return (
    <section id={id} className="sm-section" aria-labelledby={`${id}-heading`}>
      <div className="sm-section-head">
        <span className="sm-section-number">Section {number}</span>
        <h2 id={`${id}-heading`}>{title}</h2>
        {intro && <p>{intro}</p>}
      </div>
      <div className="sm-section-body">{children}</div>
    </section>
  );
}
