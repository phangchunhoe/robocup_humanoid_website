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
//   subtree_find_ball.xml             _while decision == 'find', if pasted --
//     GoBackInField, TurnOnSpot, RobotFindBall, GoToReadyPosition (CamFindBall is
//     the subtree's head-sweep-only member and is not simulated -- see the
//     WHITELIST comment in extract.js). See tickFindBall()'s own comment for the
//     phase machine mirroring its Sequence-of-3-ReactiveSequences structure.
//   GoalieZoneFindBall                _while decision == 'zone_find', if pasted --
//     self-contained (its own internal ScanPhase state machine), dispatched
//     onStart/onRunning like Kick above, no subtree composition needed.
//   GoToGoalBlockingPosition          _while decision == 'retreat', if pasted
//
// find/zone_find/retreat are optional: simulated when the paste includes their
// node(s) (checked via `this.parsed.has(...)`), a held-position fallback otherwise.
// Nodes genuinely out of scope for a single-robot, no-GameController sim (Assist,
// RLVisionKick/auto_visual_kick, ...) always stop the robot and are reported in the
// readout rather than faked.

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
import { sampleCubicBezier, sampleLongRangeCurve } from "./curves.js";

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
  "RobotFindBall::onStart": "RobotFindBall",
  "RobotFindBall::onRunning": "RobotFindBall",
  "RobotFindBall::onHalted": "RobotFindBall",
  "TurnOnSpot::onStart": "TurnOnSpot",
  "TurnOnSpot::onRunning": "TurnOnSpot",
  "TurnOnSpot::onHalted": "TurnOnSpot",
  "GoBackInField::tick": "GoBackInField",
  "GoToReadyPosition::tick": "GoToReadyPosition",
  "GoalieZoneFindBall::onStart": "GoalieZoneFindBall",
  "GoalieZoneFindBall::onRunning": "GoalieZoneFindBall",
  "GoalieZoneFindBall::onHalted": "GoalieZoneFindBall",
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
    this.resetFindBall();
    this.zoneFindBallStarted = false;
    this.lastDecision = "";
    this.telemetry = { decision: "", targetType: null, target: null, curve: null, kickDir: 0 };
  }

  /** Fresh state for the striker's FindBall subtree -- see tickFindBall()'s own comment. */
  resetFindBall() {
    this.findPhase = "reacquire"; // reacquire -> spin -> fallback (loops back to reacquire after 5s)
    this.turnOnSpotStarted = false;
    this.robotFindBallStarted = false;
    this.findSleepUntil = null;
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
    this.resetFindBall();
    this.zoneFindBallStarted = false;
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
   * decision=='find' isn't one node -- it's subtree_find_ball.xml, a plain `Sequence` of
   * three `ReactiveSequence` phases (quick_reacquire_turn, spin_and_scan, then a fallback
   * to a ready position). A plain Sequence parks at whichever child last returned RUNNING
   * and resumes ticking *only* that child -- it does not re-tick earlier, already-succeeded
   * children -- so `this.findPhase` plays that role here. Each phase's own ReactiveSequence
   * is emulated by ticking its auxiliary node (GoBackInField -- always returns SUCCESS, so
   * it never gates anything, just applies its own side effect) followed by that phase's
   * real StatefulActionNode; if the ReactiveSequence's last child completes, a plain
   * Sequence would advance to the next phase within the very same BT tick rather than
   * waiting a frame, so a completed phase here falls through into the next `if` block
   * instead of returning. CamFindBall (the subtree's third member) is deliberately not
   * ticked at all -- see the WHITELIST comment in extract.js for why.
   *
   * Every node here is optional and independently checked with `this.parsed.has(...)` --
   * the caller only reaches this method once `RobotFindBall::onStart` (Phase 2's node, the
   * one that actually spins the body) is known to be pasted; TurnOnSpot missing just skips
   * straight to the spin, and GoToReadyPosition missing holds position instead of Phase 3.
   */
  tickFindBall() {
    const watched = {};
    // Which sub-node is actually driving the robot's command this tick -- reported back
    // to the caller for the readout's "node" field, same as chase/adjust/kick already do.
    // Defaults to the subtree's own name for the (rare) case every phase is skipped
    // because none of its nodes were pasted.
    let node = "FindBall";

    if (this.parsed.has("GoBackInField::tick")) {
      const out = this.call("GoBackInField::tick", "GoBackInField", [], "find");
      Object.assign(watched, out ? out.watched : {});
    }

    if (this.findPhase === "reacquire") {
      if (!this.parsed.has("TurnOnSpot::onStart")) {
        this.findPhase = "spin";
      } else {
        const out = this.turnOnSpotStarted
          ? this.call("TurnOnSpot::onRunning", "TurnOnSpot", [], "find")
          : this.call("TurnOnSpot::onStart", "TurnOnSpot", [], "find");
        this.turnOnSpotStarted = true;
        Object.assign(watched, out ? out.watched : {});
        if (!out || out.status === "RUNNING") return { watched, node: "TurnOnSpot" };
        this.findPhase = "spin";
      }
    }

    if (this.findPhase === "spin") {
      if (!this.parsed.has("RobotFindBall::onStart")) {
        this.findPhase = "fallback";
      } else {
        const out = this.robotFindBallStarted
          ? this.call("RobotFindBall::onRunning", "RobotFindBall", [], "find")
          : this.call("RobotFindBall::onStart", "RobotFindBall", [], "find");
        this.robotFindBallStarted = true;
        Object.assign(watched, out ? out.watched : {});
        if (!out || out.status === "RUNNING") return { watched, node: "RobotFindBall" };
        this.findPhase = "fallback";
      }
    }

    // Phase 3: two full spins with no result -- the ball is genuinely not visible from
    // here. `<ReactiveSequence><GoToReadyPosition vx_limit="0.7" /><Sleep msec="5000" />
    // </ReactiveSequence>` -- a ReactiveSequence re-ticks EVERY child from the top on
    // every single tick, not just once. GoToReadyPosition::tick() always returns SUCCESS,
    // but that status isn't the point: each call issues a fresh moveToPoseOnField2(...)
    // command (the same per-tick-recomputed-velocity primitive TickChaseNode/Adjust use),
    // so it has to be re-ticked every frame for the robot to actually keep walking there
    // -- calling it once and then holding still for Sleep's 5s would only produce one
    // tick's worth of motion. Sleep itself is a BT.CPP library node, not pasted C++, so
    // it's a plain sim-time timer rather than a `this.parsed.has(...)`-gated call.
    if (this.findPhase === "fallback") {
      if (!this.parsed.has("GoToReadyPosition::tick")) {
        this.host.client.setVelocity(0, 0, 0);
        return { watched, node };
      }
      node = "GoToReadyPosition";
      if (this.findSleepUntil === null) this.findSleepUntil = this.host.simTime + 5.0;
      const out = this.call("GoToReadyPosition::tick", "GoToReadyPosition", [], "find");
      Object.assign(watched, out ? out.watched : {});
      if (this.host.simTime < this.findSleepUntil) return { watched, node };
      // Sleep elapsed: the real Sequence would report SUCCESS to the SubTree's own
      // caller here, which re-ticks it from the top on the next brain tick since
      // decision=='find' still gates it -- go back to Phase 1 rather than sitting here.
      this.findPhase = "reacquire";
      this.turnOnSpotStarted = false;
      this.robotFindBallStarted = false;
      this.findSleepUntil = null;
    }

    return { watched, node };
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
        // The robot's FOV/range/confidence/jitter view of the ball, always computed
        // regardless of host.usePreciseBall -- see host.js's syncFromWorld and the run
        // step's FOV-cone/perceived-marker debug overlay.
        perceivedBall: host.perceivedBall,
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
      } else if (decision === "find" && this.parsed.has("RobotFindBall::onStart")) {
        // Reachable now that the robot's ball perception is FOV/range-limited (see
        // perception.js) rather than always-on -- StrikerDecide can genuinely emit
        // "find" once the ball actually leaves the cone. decision=='find' is
        // subtree_find_ball.xml, not one node -- see tickFindBall()'s own comment
        // for the phase machine that mirrors it.
        if (this.lastDecision !== "find") this.resetFindBall();
        const findOut = this.tickFindBall();
        t.simulatedNode = findOut.node;
        t.findWatched = findOut.watched;
      } else if (decision === "zone_find" && this.parsed.has("GoalieZoneFindBall::onStart")) {
        // GoalieZoneFindBall is self-contained (a single StatefulActionNode with its
        // own internal ScanPhase state machine), unlike the striker's find -- same
        // onStart/onRunning dispatch as Kick above, no subtree composition needed.
        const out = this.zoneFindBallStarted
          ? this.call("GoalieZoneFindBall::onRunning", "GoalieZoneFindBall", [], decision)
          : this.call("GoalieZoneFindBall::onStart", "GoalieZoneFindBall", [], decision);
        this.zoneFindBallStarted = true;
        t.simulatedNode = "GoalieZoneFindBall";
        t.zoneFindWatched = out ? out.watched : {};
      } else if (decision === "retreat" && this.parsed.has("GoToGoalBlockingPosition::tick")) {
        const out = this.call("GoToGoalBlockingPosition::tick", "GoToGoalBlockingPosition", [], decision);
        t.simulatedNode = "GoToGoalBlockingPosition";
        t.retreatWatched = out ? out.watched : {};
      } else {
        // assist / auto_visual_kick, or find/zone_find/retreat without their node
        // pasted: genuinely out of scope for a single-robot, no-GameController sim
        // (assist needs teammates; auto_visual_kick needs a vision pipeline this sim
        // doesn't model) or simply not provided, so the robot holds position and
        // says so.
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
      // Leaving 'find' while TurnOnSpot/RobotFindBall was mid-RUNNING halts whichever
      // was actually started -- same onHalted contract as Kick above.
      if (this.lastDecision === "find" && decision !== "find") {
        if (this.turnOnSpotStarted && this.parsed.has("TurnOnSpot::onHalted")) {
          this.call("TurnOnSpot::onHalted", "TurnOnSpot", [], "find");
        }
        if (this.robotFindBallStarted && this.parsed.has("RobotFindBall::onHalted")) {
          this.call("RobotFindBall::onHalted", "RobotFindBall", [], "find");
        }
        this.resetFindBall();
      }
      if (this.lastDecision === "zone_find" && decision !== "zone_find") {
        if (this.zoneFindBallStarted && this.parsed.has("GoalieZoneFindBall::onHalted")) {
          this.call("GoalieZoneFindBall::onHalted", "GoalieZoneFindBall", [], "zone_find");
        }
        this.zoneFindBallStarted = false;
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
      const pts = sampleLongRangeCurve({
        target: w.directTarget_f,
        kickDir,
        u0: w.curveU0,
        v0: w.curveV0,
        decay: DECAY,
      });
      t.curve = pts.map((p) => [p.x, p.y]);
      return;
    }

    if (w.bezierActive && w.P0 && w.P1 && w.P2 && w.P3) {
      const pts = sampleCubicBezier(w.P0, w.P1, w.P2, w.P3);
      t.curve = pts.map((p) => [p.x, p.y]);
    }
  }
}

export { NODE_KEY, WATCH };
