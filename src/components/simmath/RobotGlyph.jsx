// Shared robot marker for every field/plane diagram on the Simulation Math page: a
// circle body with a heading line poking out past its edge, rather than a triangle —
// simple enough to read at a glance which way "theta" is pointing without implying
// any particular robot shape.
export default function RobotGlyph({ x, y, theta, r = 9, lineLength = 12, opacity = 1, className = "", ...rest }) {
  const lx = x + (r + lineLength) * Math.cos(theta);
  const ly = y - (r + lineLength) * Math.sin(theta);
  return (
    <g opacity={opacity} className={className} {...rest}>
      <line x1={x} y1={y} x2={lx} y2={ly} className="sm-robot-heading" />
      <circle cx={x} cy={y} r={r} className="sm-robot" />
    </g>
  );
}
