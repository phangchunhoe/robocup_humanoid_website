// Self-check for the C++ subset interpreter.
//
// This repo has no test runner, so the checks are exposed as a button on the simulator
// page. Each case is a snippet of the same C++ constructs the target functions use,
// with a known answer.

import { parseStatements } from "./parser.js";
import { Interpreter } from "./interpreter.js";

const STRUCTS = {
  Pose2D: ["x", "y", "theta"],
  Point2D: ["x", "y"],
  Point: ["x", "y", "z"],
  Line: ["x0", "y0", "x1", "y1"],
};

function baseGlobals() {
  const calls = [];
  const getInput = (name, ref) => {
    const table = { vx_limit: 1.2, dist: 0.38, curve_when_behind: true, label: "chase" };
    const value = table[name];
    if (ref && typeof ref.set === "function") {
      ref.set(value);
      return true;
    }
    return { value: () => value, has_value: () => true };
  };
  getInput.refParams = [1];

  return {
    calls,
    fabs: Math.abs,
    min: Math.min,
    max: Math.max,
    cos: Math.cos,
    sin: Math.sin,
    atan2: Math.atan2,
    exp: Math.exp,
    sqrt: Math.sqrt,
    floor: Math.floor,
    M_PI: Math.PI,
    norm: (x, y) => Math.sqrt(x * x + y * y),
    cap: (x, hi, lo) => Math.max(Math.min(x, hi), lo),
    sigmoid: (x, shift = 0, scale = 1) => 1 / (1 + Math.exp(scale * (x - shift))),
    format: (f, ...a) => {
      let i = 0;
      return String(f).replace(/%(?:\.(\d+))?([dfs])/g, (m, p, c) => {
        const v = a[i];
        i += 1;
        if (c === "d") return String(Math.trunc(v));
        if (c === "f") return Number(v).toFixed(p === undefined ? 6 : Number(p));
        return String(v);
      });
    },
    getInput,
    record: (v) => {
      calls.push(v);
      return v;
    },
    NodeStatus: { SUCCESS: "SUCCESS", RUNNING: "RUNNING" },
    brain: {
      data: { ball: { range: 1.5, posToRobot: { x: 1.2, y: 0.9 } } },
      client: {
        setVelocity(x, y, theta) {
          calls.push(["setVelocity", x, y, theta]);
          return 0;
        },
      },
    },
  };
}

const CASES = [
  {
    name: "arithmetic precedence and unary minus",
    code: "double a = 2 + 3 * 4; double b = -a + 1; return b;",
    expect: -13,
  },
  {
    name: "float division and M_PI",
    code: "double t = M_PI / 3.0; return t > 1.047 && t < 1.048;",
    expect: true,
  },
  {
    name: "ternary chained with comparison",
    code: "double d = -0.4; double s = (d >= 0.0) ? 1.0 : -1.0; return s;",
    expect: -1,
  },
  {
    name: "short-circuit && does not evaluate the right side",
    code: "bool ok = false && record(1) > 0; return ok;",
    expect: false,
    globalsCheck: (g) => g.calls.length === 0,
  },
  {
    name: "short-circuit || does not evaluate the right side",
    code: "bool ok = true || record(1) > 0; return ok;",
    expect: true,
    globalsCheck: (g) => g.calls.length === 0,
  },
  {
    name: "if / else if / else chain",
    code:
      "double r = 0.9; string d;\n" +
      "if (r > 2.0) { d = \"chase\"; } else if (r > 0.75) { d = \"adjust\"; } else { d = \"kick\"; }\n" +
      "return d;",
    expect: "adjust",
  },
  {
    name: "for loop with a double counter (Bezier sampling)",
    // 19, not 20: repeated += 0.05 in binary64 overshoots to 1.0000000000000002 on the
    // 20th step. C++ doubles are the same IEEE-754 format and behave identically, so
    // TickChaseNode's `for (double t = 0.05; t <= 1.0; t += 0.05)` really does run 19
    // times and never samples t = 1.0 -- which is why it pre-seeds target_f = P3.
    code:
      "double acc = 0; for (double t = 0.05; t <= 1.0; t += 0.05) { acc += 1; } return acc;",
    expect: 19,
  },
  {
    name: "for loop with break, mirroring the lookahead search",
    code:
      "double found = -1;\n" +
      "for (double t = 0.02; t <= 1.0; t += 0.02) { if (t >= 0.1) { found = t; break; } }\n" +
      "return found > 0.099 && found < 0.101;",
    expect: true,
  },
  {
    name: "struct declaration then member assignment",
    code: "Pose2D p; p.x = 1.5; p.y = -2.0; return p.x + p.y;",
    expect: -0.5,
  },
  {
    name: "brace initialisation maps positionally onto struct fields",
    code: "Line l = {1, 2, 3, 4}; return l.x0 + l.y0 * 10 + l.x1 * 100 + l.y1 * 1000;",
    expect: 1 + 20 + 300 + 4000,
  },
  {
    name: "auto copies a struct rather than aliasing it",
    code: "Point2D a = {1, 2}; auto b = a; b.x = 99; return a.x;",
    expect: 1,
  },
  {
    name: "getInput writes through its reference parameter",
    code: "double vxLimit; getInput(\"vx_limit\", vxLimit); return vxLimit;",
    expect: 1.2,
  },
  {
    name: "getInput<T>(...).value() expression form",
    code: "double d = getInput<double>(\"dist\").value(); return d;",
    expect: 0.38,
  },
  {
    name: "lambda captures the enclosing scope by reference",
    code:
      "double total = 0; auto add = [&](double v) { total += v; }; add(3); add(4); return total;",
    expect: 7,
  },
  {
    name: "member call on the mocked brain reaches the host",
    code: "brain->client->setVelocity(0.5, 0.0, 0.25); return brain->data->ball.range;",
    expect: 1.5,
    globalsCheck: (g) => g.calls.length === 1 && g.calls[0][1] === 0.5 && g.calls[0][3] === 0.25,
  },
  {
    name: "-> and . are interchangeable member access",
    code: "return brain->data->ball.posToRobot.x + brain.data.ball.posToRobot.y;",
    expect: 2.1,
  },
  {
    name: "compound assignment and postfix increment",
    code: "double v = 1.0; v *= 3; v -= 0.5; int i = 0; i++; ++i; return v + i;",
    expect: 4.5,
  },
  {
    name: "format() produces the log strings the code builds",
    code: 'return format("dist=%.2f state=%s", 1.234, "chase");',
    expect: "dist=1.23 state=chase",
  },
  {
    name: "string comparison, as used for logScope tests",
    code: 'string s = "StrikerChase"; bool a = (s == "StrikerChase"); bool b = (s == "GoalieChase"); return a && !b;',
    expect: true,
  },
  {
    name: "static local persists across calls",
    // Executed twice by the harness; the second call must see the incremented value.
    code: "static double counter = 0; counter += 1; return counter;",
    expect: 2,
    runTwice: true,
  },
  {
    name: "unresolved identifier becomes node member state (default 0)",
    code: "_someMemberNeverDeclared += 2.5; return _someMemberNeverDeclared;",
    expect: 2.5,
  },
  {
    name: "static_cast<int> truncates toward zero",
    code: "return static_cast<int>(floor(-1.7)) * 10 + static_cast<int>(1.9);",
    expect: -20 + 1,
  },
  {
    name: "nested function call with host maths",
    code:
      "double dx = 3, dy = 4; double n = norm(dx, dy); double c = cap(n, 4.0, 0.0); return c;",
    expect: 4,
  },
  {
    // Regression: `brain->data->goalBlockingTarget = {setX, setY, 0.0};` is a brace-init
    // REASSIGNMENT (not a fresh declaration), so buildStruct()'s declaration-time typing
    // never runs. Without evalInitListLike inferring the shape from the field's existing
    // value, this silently produced the array [x,y,0] instead of {x,y,z:0} -- and since
    // an array has no .x/.y, GoToGoalBlockingPosition::tick's `targetPose.x =
    // goalBlockingTarget.x` read undefined, leaving the goalkeeper's retreat walk frozen.
    name: "brace-init reassignment maps onto the existing struct's fields",
    code:
      "Point p = {1, 2, 3}; double setX = 9, setY = 8; p = {setX, setY, 0.0};" +
      "return p.x == 9 && p.y == 8 && p.z == 0;",
    expect: true,
  },
];

function approxEqual(a, b) {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return a === b;
}

/** @returns {{ passed: number, failed: number, results: Array }} */
export function runSelfTest() {
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const c of CASES) {
    const globals = baseGlobals();
    try {
      const block = parseStatements(c.code);
      const fn = { kind: "Function", params: [], body: block, key: c.name };
      const interp = new Interpreter({ globals, structLayouts: STRUCTS });

      let actual = interp.invoke(fn, [], "SelfTest");
      if (c.runTwice) actual = interp.invoke(fn, [], "SelfTest");

      let ok = approxEqual(actual, c.expect);
      if (ok && c.globalsCheck) ok = !!c.globalsCheck(globals);

      if (ok) {
        passed += 1;
        results.push({ name: c.name, ok: true });
      } else {
        failed += 1;
        results.push({
          name: c.name,
          ok: false,
          detail: `expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(actual)}`,
        });
      }
    } catch (err) {
      failed += 1;
      results.push({ name: c.name, ok: false, detail: `${err.name}: ${err.message}` });
    }
  }

  return { passed, failed, results };
}

export { CASES };
