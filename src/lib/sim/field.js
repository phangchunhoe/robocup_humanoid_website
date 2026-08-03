// Shared pitch geometry and SVG helpers for the robot simulator.
//
// The constants mirror FD_ADULTSIZE in the brain's include/types.h:
//   const FieldDimensions FD_ADULTSIZE {14, 9, 2.1, 2.6, 1.5, 3, 6, 1, 4};
// Field origin is the centre circle, +x points at the opponent goal, +y is left,
// theta = 0 faces +x and is CCW-positive. Units are metres and radians throughout,
// exactly as in the C++.
//
// Note: GoalieExplorer.jsx and FreekickExplorer.jsx each carry their own copy of
// these constants. They are verbatim transcriptions of standalone artifacts and are
// deliberately left alone; this module is for the simulator only.

export const FD = {
  length: 14,
  width: 9,
  penaltyDist: 2.1,
  goalWidth: 2.6,
  circleRadius: 1.5,
  penaltyAreaLength: 3,
  penaltyAreaWidth: 6,
  goalAreaLength: 1,
  goalAreaWidth: 4,
};

export const OUR_GOAL_X = -FD.length / 2; // -7, matches config goal_center_x
export const OPP_GOAL_X = FD.length / 2; //  +7

// SVG viewport: 900x600 at 60 px/m gives 15 m x 10 m of visible area, i.e. the
// 14 x 9 m pitch plus a 0.5 m margin on every side.
export const PXPM = 60;
export const VIEW_W = 900;
export const VIEW_H = 600;
const HALF_VIEW_M_X = VIEW_W / PXPM / 2; // 7.5
const HALF_VIEW_M_Y = VIEW_H / PXPM / 2; // 5

/** Field metres -> SVG user units. SVG y grows downward, so y is flipped. */
export const toSvg = (x, y) => [(x + HALF_VIEW_M_X) * PXPM, (HALF_VIEW_M_Y - y) * PXPM];

/** SVG user units -> field metres. */
export const toField = (sx, sy) => [sx / PXPM - HALF_VIEW_M_X, HALF_VIEW_M_Y - sy / PXPM];

const NS = "http://www.w3.org/2000/svg";

export function svgEl(name, attrs) {
  const node = document.createElementNS(NS, name);
  if (attrs) {
    for (const key of Object.keys(attrs)) node.setAttribute(key, attrs[key]);
  }
  return node;
}

/**
 * Draw the static pitch (lines, circle, both boxes, goal mouths) into `g`.
 * Called once; nothing here changes during a run.
 */
export function buildPitch(g) {
  const line = (x1, y1, x2, y2, w) => {
    const [sx1, sy1] = toSvg(x1, y1);
    const [sx2, sy2] = toSvg(x2, y2);
    g.appendChild(
      svgEl("line", {
        x1: sx1,
        y1: sy1,
        x2: sx2,
        y2: sy2,
        stroke: "var(--turf-line)",
        "stroke-width": w || 2,
      })
    );
  };
  const circle = (cx, cy, r) => {
    const [sx, sy] = toSvg(cx, cy);
    g.appendChild(
      svgEl("circle", {
        cx: sx,
        cy: sy,
        r: r * PXPM,
        fill: "none",
        stroke: "var(--turf-line)",
        "stroke-width": 2,
      })
    );
  };
  const text = (x, y, str) => {
    const [sx, sy] = toSvg(x, y);
    const t = svgEl("text", { x: sx, y: sy, "text-anchor": "middle", class: "goal-label" });
    t.textContent = str;
    g.appendChild(t);
  };

  const hl = FD.length / 2;
  const hw = FD.width / 2;

  // Touch lines and goal lines
  line(-hl, -hw, hl, -hw, 2.5);
  line(-hl, hw, hl, hw, 2.5);
  line(-hl, -hw, -hl, hw, 2.5);
  line(hl, -hw, hl, hw, 2.5);
  // Halfway line + centre circle
  line(0, -hw, 0, hw, 2);
  circle(0, 0, FD.circleRadius);
  g.appendChild(
    svgEl("circle", { cx: toSvg(0, 0)[0], cy: toSvg(0, 0)[1], r: 3, fill: "var(--turf-line)" })
  );

  for (const side of [-1, 1]) {
    const px = side * hl;
    const pL = FD.penaltyAreaLength;
    const pW = FD.penaltyAreaWidth / 2;
    line(px - side * pL, -pW, px - side * pL, pW, 2);
    line(px - side * pL, -pW, px, -pW, 2);
    line(px - side * pL, pW, px, pW, 2);

    const gL = FD.goalAreaLength;
    const gW = FD.goalAreaWidth / 2;
    line(px - side * gL, -gW, px - side * gL, gW, 2);
    line(px - side * gL, -gW, px, -gW, 2);
    line(px - side * gL, gW, px, gW, 2);

    // Goal mouth
    line(px, -FD.goalWidth / 2, px, FD.goalWidth / 2, 6);

    // Penalty mark
    const [mx, my] = toSvg(px - side * FD.penaltyDist, 0);
    g.appendChild(svgEl("circle", { cx: mx, cy: my, r: 3, fill: "var(--turf-line)" }));
  }

  text(OUR_GOAL_X + 1.35, hw - 0.35, "OUR GOAL");
  text(OPP_GOAL_X - 1.75, hw - 0.35, "OPPONENT GOAL");
}
