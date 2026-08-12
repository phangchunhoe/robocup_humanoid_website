import { useRef, useState } from "react";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { useDraggablePoint } from "../../../lib/useDraggablePoint.js";
import { ballToRobot } from "../../../lib/sim/physics.js";

const FIELD_SIZE = 170;
const FIELD_SCALE = 34;
const FC = FIELD_SIZE / 2;
const fieldToSvg = (fx, fy) => [FC + fx * FIELD_SCALE, FC - fy * FIELD_SCALE];
const svgToField = (sx, sy) => [(sx - FC) / FIELD_SCALE, -(sy - FC) / FIELD_SCALE];

const ROBOT_SIZE = 150;
const ROBOT_SCALE = 34;
const RC = ROBOT_SIZE / 2;
// Robot-frame panel: forward (x') maps to "up", left (y') maps to screen-left.
const robotToSvg = (rx, ry) => [RC - ry * ROBOT_SCALE, RC - rx * ROBOT_SCALE];

const ROBOT_R = 10;

export default function FrameTransformViz() {
  const fieldSvgRef = useRef(null);
  const [robot, setRobot] = useState({ x: -1.2, y: -0.6, theta: 0.4 });
  const [ball, setBall] = useState({ x: 1.0, y: 0.8 });

  const bindRobot = useDraggablePoint(
    fieldSvgRef,
    (sx, sy) => {
      const [fx, fy] = svgToField(sx, sy);
      return { x: fx, y: fy };
    },
    (p) => setRobot((r) => ({ ...r, x: p.x, y: p.y }))
  );
  const bindHeading = useDraggablePoint(
    fieldSvgRef,
    (sx, sy) => {
      const [fx, fy] = svgToField(sx, sy);
      return { theta: Math.atan2(fy - robot.y, fx - robot.x) };
    },
    (p) => setRobot((r) => ({ ...r, theta: p.theta }))
  );
  const bindBall = useDraggablePoint(
    fieldSvgRef,
    (sx, sy) => {
      const [fx, fy] = svgToField(sx, sy);
      return { x: fx, y: fy };
    },
    setBall
  );

  const rel = ballToRobot({ robot, ball });
  const [rsx, rsy] = fieldToSvg(robot.x, robot.y);
  const [bsx, bsy] = fieldToSvg(ball.x, ball.y);
  const headLen = 26;
  const [hsx, hsy] = [rsx + headLen * Math.cos(robot.theta), rsy - headLen * Math.sin(robot.theta)];

  const [rbx, rby] = robotToSvg(rel.x, rel.y);

  return (
    <VizFrame
      caption={
        <>
          Drag the robot, its heading handle, or the ball. Field-frame Δ = ({(ball.x - robot.x).toFixed(2)},{" "}
          {(ball.y - robot.y).toFixed(2)}) becomes robot-frame ({rel.x.toFixed(2)}, {rel.y.toFixed(2)}) — range{" "}
          <b>{rel.range.toFixed(2)} m</b>, yaw <b>{((rel.yaw * 180) / Math.PI).toFixed(0)}°</b>.
        </>
      }
    >
      <div style={{ display: "flex", gap: "var(--space-4)", justifyContent: "center", flexWrap: "wrap" }}>
        <div>
          <svg
            ref={fieldSvgRef}
            className="sm-diagram"
            viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}
            style={{ maxWidth: 170 }}
            role="img"
            aria-label="Field-frame view: robot and ball at arbitrary field positions"
          >
            <line x1={rsx} y1={rsy} x2={bsx} y2={bsy} className="sm-vector-secondary" strokeDasharray="4 3" />
            <RobotGlyph x={rsx} y={rsy} theta={robot.theta} r={ROBOT_R} lineLength={headLen - ROBOT_R} />
            <circle cx={hsx} cy={hsy} r={7} className="sm-handle" {...bindHeading} />
            <circle cx={rsx} cy={rsy} r={10} fill="transparent" {...bindRobot} style={{ cursor: "grab" }} />
            <circle cx={bsx} cy={bsy} r={8} className="sm-ball" {...bindBall} />
          </svg>
          <p className="sm-label" style={{ textAlign: "center", marginTop: 4 }}>
            field frame
          </p>
        </div>

        <div>
          <svg className="sm-diagram" viewBox={`0 0 ${ROBOT_SIZE} ${ROBOT_SIZE}`} style={{ maxWidth: 150 }} role="img" aria-label="Robot-frame view: same relationship, re-expressed relative to the robot's own heading">
            <line x1={RC} y1={0} x2={RC} y2={ROBOT_SIZE} className="sm-axis" opacity={0.25} />
            <line x1={0} y1={RC} x2={ROBOT_SIZE} y2={RC} className="sm-axis" opacity={0.25} />
            <line x1={RC} y1={RC} x2={rbx} y2={rby} className="sm-vector" />
            <RobotGlyph x={RC} y={RC} theta={Math.PI / 2} r={ROBOT_R} />
            <circle cx={rbx} cy={rby} r={8} className="sm-ball" />
          </svg>
          <p className="sm-label" style={{ textAlign: "center", marginTop: 4 }}>
            robot frame (always facing "up")
          </p>
        </div>
      </div>
    </VizFrame>
  );
}
