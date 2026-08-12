// Consistent glass-panel chrome around every formula's visualization, so ~20 different
// custom SVG diagrams still read as one system rather than as one-off inserts.
export default function VizFrame({ caption, controls, children }) {
  return (
    <div className="viz-frame">
      <div className="viz-frame-stage">{children}</div>
      {controls && <div className="viz-controls">{controls}</div>}
      {caption && <p className="viz-caption">{caption}</p>}
    </div>
  );
}
