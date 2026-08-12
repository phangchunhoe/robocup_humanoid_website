import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { createWorld, stepWorld, BALL_RADIUS, ROBOT_RADIUS, DEFAULT_PHYSICS } from "../../../lib/sim/physics.js";
import { FIXED_DT } from "../../../lib/sim/engine.js";

const W = 300;
const H = 170;
const SCALE = 110;
const ORIGIN = { x: 210, y: 85 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];

// Robot faces +x but walks backward (command vx < 0) toward a ball placed behind it —
// the foot stays out in +x the whole time, so only the torso (rear/side) branch of
// resolveContact can ever fire here.
const START = { robot: { x: 0.35, y: 0, theta: 0 }, ball: { x: -0.5, y: 0 } };
const BODY_DIST = ROBOT_RADIUS + BALL_RADIUS;
const HOLD_MS = 2000;
const TICKS_PER_FRAME = 2;
const MAX_TICKS = 300;

function freshWorld() {
  return createWorld(START, { seed: Math.floor(Math.random() * 1e9) });
}

function isColliding(world) {
  return Math.hypot(world.ball.x - world.robot.x, world.ball.y - world.robot.y) <= BODY_DIST + 0.004;
}

export default function TorsoCollisionViz() {
  const reduceMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState(() => ({ robot: { ...START.robot }, ball: { ...START.ball }, collided: false }));
  const rafRef = useRef(0);
  const timeoutRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let world = freshWorld();

    const tick = () => {
      let collided = isColliding(world);
      for (let i = 0; i < TICKS_PER_FRAME && !collided; i += 1) {
        world.command = { vx: -DEFAULT_PHYSICS.maxWalkSpeed, vy: 0, vtheta: 0 };
        stepWorld(world, FIXED_DT);
        collided = isColliding(world);
      }
      if (cancelled) return;
      setSnapshot({ robot: { ...world.robot }, ball: { ...world.ball }, collided });
      if (collided) {
        timeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          world = freshWorld();
          rafRef.current = requestAnimationFrame(tick);
        }, HOLD_MS);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    if (reduceMotion) {
      let collided = false;
      let ticks = 0;
      while (!collided && ticks < MAX_TICKS) {
        world.command = { vx: -DEFAULT_PHYSICS.maxWalkSpeed, vy: 0, vtheta: 0 };
        stepWorld(world, FIXED_DT);
        collided = isColliding(world);
        ticks += 1;
      }
      setSnapshot({ robot: { ...world.robot }, ball: { ...world.ball }, collided });
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [reduceMotion]);

  const { robot, ball, collided } = snapshot;
  const [rx, ry] = toSvg(robot.x, robot.y);
  const [bx, by] = toSvg(ball.x, ball.y);

  return (
    <VizFrame
      caption={
        collided
          ? "Contact — the ball is shoved straight back out to arm's length, no scatter and no kickGain multiplier. It's a shove, not a strike."
          : "Robot walks backward, facing away — the foot never gets near the ball, so any contact here has to be the torso's."
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Robot backing into a ball, triggering a body shove rather than a kick">
        <line x1={0} y1={ORIGIN.y + 55} x2={W} y2={ORIGIN.y + 55} className="sm-axis" opacity={0.3} />
        <circle cx={bx} cy={by} r={9} className="sm-ball" />
        <RobotGlyph x={rx} y={ry} theta={robot.theta} />
      </svg>
    </VizFrame>
  );
}
