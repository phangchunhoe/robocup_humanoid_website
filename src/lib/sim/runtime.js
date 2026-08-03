// Assembles a runnable program from the pasted files and executes one behaviour-tree
// slice per brain tick.
//
// The slice mirrors subtree_striker_play.xml / subtree_goal_keeper_play.xml:
//
//   CalcKickDir                       (every tick)
//   StrikerDecide | GoalieDecide      -> writes {decision}
//   StrikerChase | GoalieChase        _while decision == 'chase'
//   Adjust                            _while decision == 'adjust'
//   Kick                              _while decision == 'kick' | 'cross'
//
// Nodes the simulator does not model (FindBall, Assist, GoToGoalBlockingPosition,
// RLVisionKick, ...) stop the robot and are reported in the readout rather than faked.

import {
  extractFunctions,
  extractFileScopeVars,
  unresolvedCalls,
  requestedPorts,
  REQUIRED_BY_ROLE,
} from "../cpp/extract.js";
import { parseFunctionBody, parseExpressionSource, ParseError } from "../cpp/parser.js";
import { LexError, posToLineCol } from "../cpp/lexer.js";
import { Interpreter, RuntimeError } from "../cpp/interpreter.js";
import { SimHost, STRUCT_LAYOUTS } from "./host.js";
import { parseBehaviorXml } from "./btxml.js";
import { parseNodeHeader } from "./nodeheader.js";

/**
 * Which behaviour-tree node's ports a function reads through getInput().
 *
 * TickChaseNode is shared: it reads the ports of whichever Chase node called it, so its
 * mapping depends on the role.
 */
function portOwner(fnName, role) {
  if (fnName === "TickChaseNode") return role === "goal_keeper" ? "GoalieChase" : "StrikerChase";
  if (fnName.includes("::")) return fnName.split("::")[0];
  return null;
}

/**
 * Does this node's providedPorts() declare the port, per the pasted header?
 *
 * The Chase variants inherit Chase::providedPorts() and add to it, which is why the
 * lookup walks a chain rather than a single class.
 */
function declaresPort(portDefaults, node, port) {
  const chain =
    node === "StrikerChase" || node === "GoalieChase" || node === "DefenderChase"
      ? [node, "Chase"]
      : [node];
  return chain.some(
    (cls) => portDefaults[cls] && Object.prototype.hasOwnProperty.call(portDefaults[cls], port)
  );
}

/** Which node instance owns the member state each function mutates. */
const NODE_KEY = {
  "StrikerChase::tick": "StrikerChase",
  "GoalieChase::tick": "GoalieChase",
  "Chase::tick": "Chase",
  "Adjust::tick": "Adjust",
  "StrikerDecide::tick": "StrikerDecide",
  "GoalieDecide::tick": "GoalieDecide",
  "Kick::onStart": "Kick",
  "Kick::onRunning": "Kick",
  "Kick::onHalted": "Kick",
  "CalcKickDir::tick": "CalcKickDir",
  "GoToGoalBlockingPosition::tick": "GoToGoalBlockingPosition",
  TickChaseNode: "Chase",
};

/** Locals read back out of the running code for the readout and the drawn path. */
const WATCH = new Set([
  // TickChaseNode
  "targetType", "target_f", "directTarget_f", "bezierActive", "longRangeCurveActive",
  "circleBackDir", "angDiff", "distToApproachTarget", "curveU0", "curveV0",
  "P0", "P1", "P2", "P3", "blend", "arcAngle", "dynamicOffsetDist", "kickDir",
  // Read from the code so an edit to the constant moves the drawn curve too.
  "FAR_CURVE_DECAY_CONST",
  // Decide
  "newDecision", "deltaDir", "ballRange", "shouldChase", "canKickOrCross",
  "straightShotReady", "chaseThresholdValue",
  // Adjust
  "st", "sr", "arc_len", "effectiveDirSign", "turn_first",
  // Kick
  "phase", "speed", "msecs",
  // GoToGoalBlockingPosition
  "targetPose", "dist", "deltaTheta",
]);

/**
 * Parse everything and report what happened. Never throws.
 *
 * @returns {{ ok: boolean, runtime: SimRuntime|null, report: object }}
 */
export function buildProgram({ cppText, xmlText, headerText, role }) {
  const report = {
    functions: [], // { name, status: "parsed"|"failed"|"missing", role, detail }
    dependencies: [],
    unresolved: [],
    xmlError: null,
    xmlNodes: [],
    headerClasses: [],
    stats: null,
    missingRequired: [],
  };

  const { ports, instances, nodes, error: xmlError } = parseBehaviorXml(xmlText);
  report.xmlError = xmlError;
  report.xmlNodes = nodes;

  const { portDefaults, members, classes } = parseNodeHeader(headerText);
  report.headerClasses = classes;

  const host = new SimHost({ role, ports, instances, portDefaults });
  const globals = host.globals();
  const hostNames = new Set(Object.keys(globals));

  if (!cppText || !cppText.trim()) {
    report.missingRequired = REQUIRED_BY_ROLE[role] || [];
    return { ok: false, runtime: null, report };
  }

  const { functions, notFound, dependencies, cleaned, stats } = extractFunctions(cppText, hostNames);
  report.stats = stats;
  report.dependencies = dependencies;
  report.unresolved = unresolvedCalls(functions, cleaned, hostNames);

  // Parse each extracted body.
  const parsed = new Map();
  for (const [name, fn] of functions) {
    try {
      const ast = parseFunctionBody(fn.bodySrc, fn.bodyStart, fn.params);
      ast.key = name;
      parsed.set(name, ast);
      report.functions.push({
        name,
        status: "parsed",
        role: fn.role,
        lines: fn.bodySrc.split("\n").length,
      });
    } catch (err) {
      const pos = err instanceof ParseError || err instanceof LexError ? err.pos : fn.bodyStart;
      const { line, col } = posToLineCol(cppText, pos);
      report.functions.push({
        name,
        status: "failed",
        role: fn.role,
        detail: err.message,
        line,
        col,
      });
    }
  }
  for (const name of notFound) {
    report.functions.push({ name, status: "missing", role: "whitelisted" });
  }

  const required = REQUIRED_BY_ROLE[role] || [];
  report.missingRequired = required.filter((n) => !parsed.has(n));

  if (report.missingRequired.length > 0) {
    return { ok: false, runtime: null, report };
  }

  // A port that silently resolves to 0 does not degrade gracefully -- it changes what the
  // code does. Adjust's session_timeout_ms is the sharp case: the header default is
  // 4000 ms, and at 0 the watchdog trips on the very first tick, so Adjust never runs and
  // the robot never lines up a kick.
  //
  // The precise rule is "does this port resolve the same way it would on the robot?":
  //
  //   declared in providedPorts() -> the robot always has a value, so we must too.
  //       Missing one means the header was not pasted. Blocking.
  //   not declared anywhere       -> getInput() fails on the real robot too and the
  //       caller ignores the result (e.g. StrikerDecide's "position"). Reported, not
  //       blocking, because 0 is no less correct than what the robot does.
  //
  // Guarded reads are why this cannot simply demand every requested port: TickChaseNode
  // reads open_vx_limit and the curve_* ports only when isOpenChase is true, which is
  // false for GoalieChase, so those are never actually fetched in a goalkeeper run.
  report.unresolvedPorts = [];
  report.undeclaredPorts = [];
  report.portSources = {};
  report.headerMissing = classes.length === 0;

  for (const name of required) {
    const fn = functions.get(name);
    if (!fn) continue;
    const owner = portOwner(name, role);
    if (!owner) continue;
    for (const port of requestedPorts(fn.bodySrc)) {
      const key = `${owner}.${port}`;
      const hit = host.resolvePortStatically(owner, port);
      if (hit.source) {
        report.portSources[key] = hit.source;
      } else if (declaresPort(portDefaults, owner, port)) {
        report.unresolvedPorts.push(key);
      } else {
        report.undeclaredPorts.push(key);
      }
    }
  }
  report.unresolvedPorts = [...new Set(report.unresolvedPorts)].sort();
  report.undeclaredPorts = [...new Set(report.undeclaredPorts)].sort();

  if (report.headerMissing || report.unresolvedPorts.length > 0) {
    return { ok: false, runtime: null, report };
  }

  const fileScopeVars = extractFileScopeVars(cppText, cleaned);
  report.fileScopeVars = fileScopeVars.map((v) => v.name);

  const runtime = new SimRuntime({ host, globals, parsed, members, role, fileScopeVars });
  return { ok: true, runtime, report };
}

export class SimRuntime {
  constructor({ host, globals, parsed, members, role, fileScopeVars = [] }) {
    this.host = host;
    this.role = role;
    this.parsed = parsed;
    this.members = members;
    this.fileScopeVars = fileScopeVars;
    this.error = null;

    // Only brain->log->strategy() is ever displayed (see drainLogs in RobotSimulator.jsx);
    // debug()/log() fire far more often -- a real run hit 400 total log calls (any level)
    // within one second of simulated time -- so a single shared, level-agnostic ring buffer
    // let high-frequency debug/log noise evict rare strategy entries within moments of a
    // run starting. Storing only strategy-level entries means the cap is sized for what is
    // actually rare, and a full run doesn't silently lose its early transitions.
    this.logs = [];
    // logSeq increments on every call and never resets when the ring evicts, unlike
    // logs.length -- once logs.length plateaus at the cap, `length !== previous length`
    // stops being true forever and the UI's "did anything change" check would silently
    // stop firing. logSeq keeps changing for as long as new entries arrive.
    this.logSeq = 0;
    host.onLog = (entry) => {
      if (entry.level !== "strategy") return;
      this.logs.push(entry);
      this.logSeq += 1;
      if (this.logs.length > 2000) this.logs.shift();
    };

    // Expose the extracted user functions as callable globals so, for example,
    // StrikerChase::tick can call TickChaseNode.
    const g = { ...globals };
    for (const [name, ast] of parsed) {
      const bare = name.includes("::") ? name.split("::").pop() : name;
      const wrapper = () => {};
      wrapper.__parsedFunction = ast;
      wrapper.__nodeKey = NODE_KEY[name] || "global";
      if (!Object.prototype.hasOwnProperty.call(g, name)) g[name] = wrapper;
      if (!Object.prototype.hasOwnProperty.call(g, bare)) g[bare] = wrapper;
    }
    this.globals = g;

    this.unknownSymbols = [];
    this.interp = new Interpreter({
      globals: g,
      structLayouts: STRUCT_LAYOUTS,
      watchNames: WATCH,
      onUnknownSymbol: (name, nodeKey) => {
        this.unknownSymbols.push(`${nodeKey}.${name}`);
      },
    });

    this.seedMembers();
    this.seedFileScopeVars();

    this.kickPhase = "idle"; // idle | running
    this.lastDecision = "";
    this.telemetry = { decision: "", targetType: null, target: null, curve: null, kickDir: 0 };
  }

  seedMembers() {
    // brain_tree.h member initialisers, e.g. Kick::_lockDurationMs = 1200.0
    for (const cls of Object.keys(this.members)) {
      this.interp.seedNodeMembers(cls, this.members[cls]);
    }
  }

  /**
   * Evaluate file-scope initialisers into shared globals. One table for all nodes, so
   * g_adjustWatchdogTimeout really is the same variable in Adjust and StrikerDecide.
   */
  seedFileScopeVars() {
    this.fileScopeVarErrors = [];
    for (const v of this.fileScopeVars) {
      // Never shadow a host built-in.
      if (Object.prototype.hasOwnProperty.call(this.globals, v.name) && !v.__seeded) continue;
      try {
        const ast = parseExpressionSource(v.initSrc);
        this.globals[v.name] = this.interp.eval(ast, { lookup: () => null }, "fileScope");
        v.__seeded = true;
      } catch (err) {
        this.fileScopeVarErrors.push(`${v.name}: ${err.message}`);
      }
    }
  }

  reset(role) {
    this.interp.reset();
    this.seedMembers();
    this.seedFileScopeVars();
    this.host.reset(role || this.role);
    if (role) this.role = role;
    this.logs.length = 0;
    this.logSeq = 0;
    this.unknownSymbols.length = 0;
    this.kickPhase = "idle";
    this.lastDecision = "";
    this.error = null;
    this.telemetry = { decision: "", targetType: null, target: null, curve: null, kickDir: 0 };
  }

  call(name, nodeName, args = [], decision = null) {
    const ast = this.parsed.get(name);
    if (!ast) return undefined;
    this.host.currentNode = nodeName;
    // Disambiguates sibling XML instances of the same node -- subtree_striker_play.xml
    // has two <Kick> tags, one guarded by decision=='kick' (prefer_straight, tight
    // tolerances) and one by decision=='cross' (bare defaults). Without this the merged
    // "last tag wins" view could hand the cross kick the shoot kick's straight-kick gate,
    // which fails every tick and leaves the robot standing over a stationary ball.
    this.host.currentDecision = decision;
    this.interp.watched = {};
    const out = this.interp.invoke(ast, args, NODE_KEY[name] || nodeName);
    return { status: out, watched: this.interp.watched };
  }

  /**
   * One brain tick. Returns telemetry; on a runtime error it stops the robot, records
   * the error and reports it -- the page surfaces it instead of silently freezing.
   */
  tick(world) {
    if (this.error) return this.telemetry;
    const host = this.host;
    host.syncFromWorld(world);

    try {
      const isGoalie = this.role === "goal_keeper";

      // <CalcKickDir />
      this.call("CalcKickDir::tick", "CalcKickDir");

      // <StrikerDecide ... /> or <GoalieDecide ... />
      const decideFn = isGoalie ? "GoalieDecide::tick" : "StrikerDecide::tick";
      const decideNode = isGoalie ? "GoalieDecide" : "StrikerDecide";
      const decideOut = this.call(decideFn, decideNode, [], host.blackboard.decision);
      const decision = String(host.blackboard.decision || "");

      const t = {
        decision,
        kickDir: host.data.kickDir,
        kickType: host.data.kickType,
        targetType: null,
        target: null,
        curve: null,
        decideWatched: decideOut ? decideOut.watched : {},
        chaseWatched: null,
        adjustWatched: null,
        kickWatched: null,
        simulatedNode: null,
      };

      if (decision === "chase") {
        const fn = isGoalie ? "GoalieChase::tick" : "StrikerChase::tick";
        const node = isGoalie ? "GoalieChase" : "StrikerChase";
        const out = this.call(fn, node, [], decision);
        t.simulatedNode = node;
        t.chaseWatched = out ? out.watched : {};
        this.applyChaseTelemetry(t);
      } else if (decision === "adjust") {
        const out = this.call("Adjust::tick", "Adjust", [], decision);
        t.simulatedNode = "Adjust";
        t.adjustWatched = out ? out.watched : {};
      } else if (decision === "kick" || decision === "cross") {
        t.simulatedNode = "Kick";
        if (this.kickPhase === "idle") {
          const out = this.call("Kick::onStart", "Kick", [], decision);
          t.kickWatched = out ? out.watched : {};
          this.kickPhase = out && out.status === "RUNNING" ? "running" : "idle";
        } else {
          const out = this.call("Kick::onRunning", "Kick", [], decision);
          t.kickWatched = out ? out.watched : {};
          if (out && out.status !== "RUNNING") this.kickPhase = "idle";
        }
      } else if (decision === "retreat" && this.parsed.has("GoToGoalBlockingPosition::tick")) {
        const out = this.call("GoToGoalBlockingPosition::tick", "GoToGoalBlockingPosition", [], decision);
        t.simulatedNode = "GoToGoalBlockingPosition";
        t.retreatWatched = out ? out.watched : {};
      } else {
        // find / assist / zone_find / auto_visual_kick: those subtrees are not part of
        // what this page tests, so the robot holds position and says so.
        host.client.setVelocity(0, 0, 0);
        t.simulatedNode = null;
      }

      // Leaving kick/cross halts the node, which is where lastKickExitTime is stamped.
      if (
        (this.lastDecision === "kick" || this.lastDecision === "cross") &&
        decision !== "kick" &&
        decision !== "cross"
      ) {
        this.kickPhase = "idle";
        if (this.parsed.has("Kick::onHalted")) {
          this.call("Kick::onHalted", "Kick", [], this.lastDecision);
        }
      }
      this.lastDecision = decision;

      this.telemetry = t;
      return t;
    } catch (err) {
      this.host.client.setVelocity(0, 0, 0);
      this.error = {
        message: err instanceof RuntimeError ? err.message : String(err && err.message ? err.message : err),
        pos: err && err.pos,
        kind: err && err.name,
      };
      return this.telemetry;
    }
  }

  /** Turn TickChaseNode's own locals into the target marker and drawn path. */
  applyChaseTelemetry(t) {
    const w = t.chaseWatched || {};
    if (typeof w.targetType === "string") t.targetType = w.targetType;
    if (w.target_f && typeof w.target_f.x === "number") {
      t.target = { x: w.target_f.x, y: w.target_f.y };
    }

    if (w.longRangeCurveActive && w.directTarget_f && typeof w.curveU0 === "number") {
      // Exponential-decay approach line, sampled exactly as the C++ samples it, using
      // the decay constant the code itself declared.
      const DECAY = typeof w.FAR_CURVE_DECAY_CONST === "number" ? w.FAR_CURVE_DECAY_CONST : 4.0;
      const kickDir = typeof w.kickDir === "number" ? w.kickDir : this.host.data.kickDir;
      const ux = Math.cos(kickDir);
      const uy = Math.sin(kickDir);
      const vx = -Math.sin(kickDir);
      const vy = Math.cos(kickDir);
      const pts = [];
      for (let s = 0; s <= 1.0001; s += 0.04) {
        const u = w.curveU0 * (1 - s);
        const v = w.curveV0 * Math.exp(-DECAY * s);
        pts.push([
          w.directTarget_f.x + u * ux + v * vx,
          w.directTarget_f.y + u * uy + v * vy,
        ]);
      }
      t.curve = pts;
      return;
    }

    if (w.bezierActive && w.P0 && w.P1 && w.P2 && w.P3) {
      const pts = [];
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const it = 1 - s;
        pts.push([
          it * it * it * w.P0.x + 3 * it * it * s * w.P1.x + 3 * it * s * s * w.P2.x + s * s * s * w.P3.x,
          it * it * it * w.P0.y + 3 * it * it * s * w.P1.y + 3 * it * s * s * w.P2.y + s * s * s * w.P3.y,
        ]);
      }
      t.curve = pts;
    }
  }
}

export { NODE_KEY, WATCH };
