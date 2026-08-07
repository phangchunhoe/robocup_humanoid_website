// Imperative SVG rendering for the simulator.
//
// React never re-renders during a run: the page holds this renderer in a ref and calls
// update() from the rAF loop, which mutates attributes on nodes created once at mount.
// That keeps a 100 Hz simulation at a steady frame rate.

import { FD, PXPM, toSvg, svgEl, buildPitch, OPP_GOAL_X } from "./field.js";
import { BALL_RADIUS, ROBOT_RADIUS } from "./physics.js";

const DECISION_COLOR = {
  chase: "var(--decision-chase)",
  adjust: "var(--decision-adjust)",
  kick: "var(--decision-kick)",
  cross: "var(--decision-kick)",
  find: "var(--decision-idle)",
  retreat: "var(--decision-idle)",
  assist: "var(--decision-idle)",
  zone_find: "var(--decision-idle)",
};

export function createRenderer(svg) {
  // Static pitch
  const pitch = svgEl("g", { id: "pitchStatic" });
  svg.appendChild(pitch);
  buildPitch(pitch);

  // Dynamic layers, back to front.
  // A <path>, not a <polyline>: world.trail is an array of segments (see its
  // own comment in physics.js), and only a path's multiple "M" subpaths let
  // a pause-then-resume render as a real gap rather than a single flat
  // point list, which would draw a straight connector across whatever
  // ground the robot covered while tracking was off.
  const trailPath = svgEl("path", {
    fill: "none",
    stroke: "var(--decision-chase)",
    "stroke-width": 2,
    "stroke-opacity": 0.45,
    "stroke-linejoin": "round",
    "stroke-linecap": "round",
  });
  svg.appendChild(trailPath);

  const plannedPath = svgEl("path", {
    fill: "none",
    stroke: "var(--decision-adjust)",
    "stroke-width": 2.5,
    "stroke-dasharray": "7 5",
    "stroke-opacity": 0.9,
  });
  svg.appendChild(plannedPath);

  const kickRay = svgEl("line", {
    stroke: "var(--decision-kick)",
    "stroke-width": 2,
    "stroke-dasharray": "4 4",
    "stroke-opacity": 0.85,
  });
  svg.appendChild(kickRay);

  const targetMark = svgEl("g", {});
  targetMark.appendChild(
    svgEl("circle", { r: 7, fill: "none", stroke: "var(--decision-adjust)", "stroke-width": 2 })
  );
  targetMark.appendChild(
    svgEl("circle", { r: 2.5, fill: "var(--decision-adjust)" })
  );
  svg.appendChild(targetMark);

  const ballVel = svgEl("line", { stroke: "var(--ball-stroke)", "stroke-width": 2.5 });
  svg.appendChild(ballVel);

  const ballG = svgEl("g", { class: "sim-ball" });
  ballG.appendChild(
    svgEl("circle", {
      r: BALL_RADIUS * PXPM,
      fill: "var(--ball-fill)",
      stroke: "var(--ball-stroke)",
      "stroke-width": 2,
    })
  );
  svg.appendChild(ballG);

  const robotG = svgEl("g", { class: "sim-robot" });
  const robotBody = svgEl("circle", {
    r: ROBOT_RADIUS * PXPM,
    fill: "var(--decision-chase)",
    "fill-opacity": 0.22,
    stroke: "var(--decision-chase)",
    "stroke-width": 2.5,
  });
  robotG.appendChild(robotBody);
  const robotHeading = svgEl("path", {
    d: `M 0 0 L ${ROBOT_RADIUS * PXPM * 1.55} -6 L ${ROBOT_RADIUS * PXPM * 1.55} 6 Z`,
    fill: "var(--decision-chase)",
    "fill-opacity": 0.8,
  });
  robotG.appendChild(robotHeading);
  const footL = svgEl("circle", { r: 4, fill: "var(--color-label)", "fill-opacity": 0.7 });
  const footR = svgEl("circle", { r: 4, fill: "var(--color-label)", "fill-opacity": 0.7 });
  robotG.appendChild(footL);
  robotG.appendChild(footR);
  svg.appendChild(robotG);

  const stanceBiasPx = 0.06 * PXPM;
  footL.setAttribute("cx", 0.1 * PXPM);
  footL.setAttribute("cy", -stanceBiasPx);
  footR.setAttribute("cx", 0.1 * PXPM);
  footR.setAttribute("cy", stanceBiasPx);

  function update(world, telemetry) {
    const r = world.robot;
    const b = world.ball;

    const [rx, ry] = toSvg(r.x, r.y);
    robotG.setAttribute(
      "transform",
      `translate(${rx.toFixed(2)} ${ry.toFixed(2)}) rotate(${((-r.theta * 180) / Math.PI).toFixed(2)})`
    );
    const color = DECISION_COLOR[telemetry.decision] || "var(--decision-idle)";
    robotBody.setAttribute("stroke", color);
    robotBody.setAttribute("fill", color);
    robotHeading.setAttribute("fill", color);

    const [bx, by] = toSvg(b.x, b.y);
    ballG.setAttribute("transform", `translate(${bx.toFixed(2)} ${by.toFixed(2)})`);

    // Ball velocity arrow, 0.25 s of lookahead
    const bspeed = Math.hypot(b.vx, b.vy);
    if (bspeed > 0.05) {
      const [ex, ey] = toSvg(b.x + b.vx * 0.25, b.y + b.vy * 0.25);
      ballVel.setAttribute("x1", bx);
      ballVel.setAttribute("y1", by);
      ballVel.setAttribute("x2", ex);
      ballVel.setAttribute("y2", ey);
      ballVel.setAttribute("visibility", "visible");
    } else {
      ballVel.setAttribute("visibility", "hidden");
    }

    // Trail — one subpath per segment, always painted when present.
    // world.trailTracking (physics.js) gates whether *new* points get
    // appended to the current segment, not whether existing segments are
    // drawn, so turning tracking off leaves them in place rather than
    // hiding them; only an explicit Clear empties world.trail itself. Each
    // segment starts its own "M" rather than continuing the previous
    // segment's "L", so a paused-then-resumed trail renders as a real gap —
    // not a straight connector across whatever ground was covered while
    // tracking was off.
    let d = "";
    for (const segment of world.trail) {
      if (segment.length < 2) continue;
      segment.forEach(([tx, ty], i) => {
        const [sx, sy] = toSvg(tx, ty);
        d += `${i === 0 ? "M" : "L"} ${sx.toFixed(1)} ${sy.toFixed(1)} `;
      });
    }
    trailPath.setAttribute("d", d.trim());

    // Chase target the interpreted code is currently steering to
    if (telemetry.target) {
      const [tx, ty] = toSvg(telemetry.target.x, telemetry.target.y);
      targetMark.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
      targetMark.setAttribute("visibility", "visible");
    } else {
      targetMark.setAttribute("visibility", "hidden");
    }

    // Planned curve (Bezier control points or long-range curve samples)
    if (telemetry.curve && telemetry.curve.length > 1) {
      let d = "";
      telemetry.curve.forEach(([cx, cy], i) => {
        const [sx, sy] = toSvg(cx, cy);
        d += `${i === 0 ? "M" : "L"} ${sx.toFixed(1)} ${sy.toFixed(1)} `;
      });
      plannedPath.setAttribute("d", d.trim());
      plannedPath.setAttribute("visibility", "visible");
    } else {
      plannedPath.setAttribute("visibility", "hidden");
    }

    // kickDir ray from the ball
    if (typeof telemetry.kickDir === "number" && Number.isFinite(telemetry.kickDir)) {
      const len = 1.4;
      const [ex, ey] = toSvg(
        b.x + len * Math.cos(telemetry.kickDir),
        b.y + len * Math.sin(telemetry.kickDir)
      );
      kickRay.setAttribute("x1", bx);
      kickRay.setAttribute("y1", by);
      kickRay.setAttribute("x2", ex);
      kickRay.setAttribute("y2", ey);
      kickRay.setAttribute("visibility", "visible");
    } else {
      kickRay.setAttribute("visibility", "hidden");
    }
  }

  return { update };
}

export { DECISION_COLOR, FD, OPP_GOAL_X };
