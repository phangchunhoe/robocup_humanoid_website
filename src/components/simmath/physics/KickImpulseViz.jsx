import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import VizFrame from "../VizFrame.jsx";
import RobotGlyph from "../RobotGlyph.jsx";
import { createWorld, stepWorld, DEFAULT_PHYSICS } from "../../../lib/sim/physics.js";
import { FIXED_DT } from "../../../lib/sim/engine.js";

const W = 300;
const H = 170;
const SCALE = 70;
const ORIGIN = { x: 130, y: 85 };
const toSvg = (fx, fy) => [ORIGIN.x + fx * SCALE, ORIGIN.y - fy * SCALE];

const START = { robot: { x: -1.5, y: 0, theta: 0 }, ball: { x: 0, y: 0 } };
const HOLD_MS = 2000;
const TICKS_PER_FRAME = 2;
const MAX_TICKS = 400;

function freshWorld() {
  return createWorld(START, { seed: Math.floor(Math.random() * 1e9) });
}

function findStrike(world) {
  return world.events.find((e) => e.type === "strike") || null;
}

/**
 * Reuses the real physics engine (createWorld/stepWorld) rather than a second,
 * hand-rolled contact model — this is exactly the resolveContact code path a live run
 * exercises, just fed one scripted command (walk straight at the ball) and watched for
 * its own "strike" event.
 */
export default function KickImpulseViz() {
  const reduceMotion = useReducedMotion();
  const [snapshot, setSnapshot] = useState(() => ({ robot: { ...START.robot }, ball: { ...START.ball }, struck: null }));
  const rafRef = useRef(0);
  const timeoutRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let world = freshWorld();

    const tick = () => {
      let strike = findStrike(world);
      for (let i = 0; i < TICKS_PER_FRAME && !strike; i += 1) {
        world.command = { vx: DEFAULT_PHYSICS.maxWalkSpeed, vy: 0, vtheta: 0 };
        stepWorld(world, FIXED_DT);
        strike = findStrike(world);
      }
      if (cancelled) return;
      setSnapshot({ robot: { ...world.robot }, ball: { ...world.ball }, struck: strike });
      if (strike) {
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
      let strike = null;
      let ticks = 0;
      while (!strike && ticks < MAX_TICKS) {
        world.command = { vx: DEFAULT_PHYSICS.maxWalkSpeed, vy: 0, vtheta: 0 };
        stepWorld(world, FIXED_DT);
        strike = findStrike(world);
        ticks += 1;
      }
      setSnapshot({ robot: { ...world.robot }, ball: { ...world.ball }, struck: strike });
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [reduceMotion]);

  const { robot, ball, struck } = snapshot;
  const [rx, ry] = toSvg(robot.x, robot.y);
  const [bx, by] = toSvg(ball.x, ball.y);

  const sigmaRad = (DEFAULT_PHYSICS.kickDirSigmaDeg * Math.PI) / 180;
  const idealDir = struck ? struck.dir - (struck.errDeg * Math.PI) / 180 : 0;
  const wedgeLen = 90;

  return (
    <VizFrame
      caption={
        struck ? (
          <>
            Contact — outgoing speed <b>{struck.speed.toFixed(2)} m/s</b>, landed{" "}
            <b>
              {struck.errDeg >= 0 ? "+" : ""}
              {struck.errDeg.toFixed(1)}°
            </b>{" "}
            off the ideal contact normal (bias + this run's random scatter, shaded band). Resets with a
            fresh seed and replays.
          </>
        ) : (
          "The robot walks straight at the ball at its capped max speed — watch for the moment the foot reaches it."
        )
      }
    >
      <svg className="sm-diagram" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Robot approaching and kicking a ball, animated">
        <line x1={0} y1={ORIGIN.y + 55} x2={W} y2={ORIGIN.y + 55} className="sm-axis" opacity={0.3} />

        {struck && (
          <path
            d={`M ${bx} ${by} L ${bx + wedgeLen * Math.cos(idealDir - sigmaRad)} ${by - wedgeLen * Math.sin(idealDir - sigmaRad)} A ${wedgeLen} ${wedgeLen} 0 0 0 ${bx + wedgeLen * Math.cos(idealDir + sigmaRad)} ${by - wedgeLen * Math.sin(idealDir + sigmaRad)} Z`}
            fill="var(--color-accent)"
            opacity={0.18}
          />
        )}
        {struck && (
          <line x1={bx} y1={by} x2={bx + wedgeLen * Math.cos(struck.dir)} y2={by - wedgeLen * Math.sin(struck.dir)} className="sm-vector" />
        )}

        <RobotGlyph x={rx} y={ry} theta={robot.theta} />
        <circle cx={bx} cy={by} r={9} className="sm-ball" />
      </svg>
    </VizFrame>
  );
}
