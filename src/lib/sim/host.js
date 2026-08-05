// The mocked `brain` the interpreted C++ executes against, plus every host built-in.
//
// Two rules govern what belongs here:
//   * If it lives in brain_tree.cpp, it is NOT here -- it comes from the paste. There are
//     no behavioural fallbacks; the point is that the pasted code drives the robot.
//   * If it lives in brain.cpp, include/utils, types.h, rclcpp or the STL, it IS here,
//     implemented natively and faithfully to the original.
//
// Everything the brain reads (data->ball, data->robotPoseToField, ...) is refreshed from
// the physics world once per tick by syncFromWorld(). Everything it writes
// (client->setVelocity, client->crabWalk) lands in host.command, which physics consumes.

import { FD, OUR_GOAL_X } from "./field.js";
import { ballToRobot } from "./physics.js";
import { selectInstance } from "./btxml.js";

/** Struct field orders, from include/types.h. Used for brace initialisation. */
export const STRUCT_LAYOUTS = {
  Pose2D: ["x", "y", "theta"],
  Point: ["x", "y", "z"],
  Point2D: ["x", "y"],
  Line: ["x0", "y0", "x1", "y1"],
  BoundingBox: ["xmin", "xmax", "ymin", "ymax"],
};

/**
 * Config values, transcribed from Robocup-Humanoid-/src/brain/config/config.yaml.
 * There is no config tab: these ARE the run's configuration, and are displayed
 * read-only on the simulation view so it is always visible what was assumed.
 */
export const CONFIG_DEFAULTS = {
  vx_limit: 1.2,
  vy_limit: 0.55,
  vtheta_limit: 1.2,
  kick_burst_vx_limit: 2.0,
  min_vx: 0.05,
  min_vy: 0.05,
  min_vtheta: 0.1,
  find_spin_speed: 0.6,
  robot_height: 1.12,
  vx_factor: 0.8,
  odom_factor: 1.2,

  ball_confidence_threshold: 50.0,
  ball_memory_timeout: 2.0,
  limit_near_ball_speed: true,
  near_ball_speed_limit: 0.35,
  near_ball_range: 1.0,
  ball_out_threshold: 2.0,
  stance_bias: 0.06,
  abort_kick_when_ball_moved: true,

  // Single robot, no obstacles: avoidance is inert either way, but these mirror the file.
  avoid_during_kick: false,
  avoid_during_chase: true,
  kick_ao_safe_dist: 3.0,
  chase_ao_safe_dist: 3.5,

  goal_center_x: OUR_GOAL_X, // -7.0
  penalty_x_limit: -4.0,
  boundary_hysteresis: 0.1,
  retreat_line_offset: 0.5,
  enable_auto_visual_kick: false,
  auto_visual_kick_enable_dist_min: 0.2,
  auto_visual_kick_enable_dist_max: 4.0,
  auto_visual_kick_enable_angle: 0.8,
  goalkeeper_straight_yaw_tolerance: 0.35,
  goalkeeper_straight_y_tolerance: 0.12,

  // obstacle_avoidance.* -- used by moveToPoseOnField2's avoidObstacle branch, which
  // GoToGoalBlockingPosition never enables (it always passes avoidObstacle=false), but
  // the values are transcribed for completeness and for any other paste that reads them.
  safe_distance: 2.0,
  avoid_secs: 3.0,

  // strategy.goalkeeper.fallback_block_dist -- no config.yaml entry exists, so the
  // ROS declared default from BrainConfig::get_goalkeeper_fallback_block_dist() applies.
  goalkeeper_fallback_block_dist: 0.6,
};

const NO_OBSTACLE_DIST = 99.0;

/**
 * A do-nothing stand-in for a Brain member the simulator does not model.
 *
 * It is callable, and any member access on it yields another one, so a chain such as
 * `brain->visualizer->publishPlayerDecision(...)` works all the way through. Calling it
 * yields 0 so an unmodelled getter used in arithmetic stays numeric.
 */
function inertMember() {
  const target = function inert() {
    return 0;
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return () => 0;
      if (prop === "valueOf") return () => 0;
      if (prop === "toString") return () => "";
      // Keep .bind/.call/.apply behaving like a real function so the interpreter's
      // method binding does not receive a non-function back.
      if (prop === "bind" || prop === "call" || prop === "apply") return () => inertMember();
      return inertMember();
    },
    set: () => true,
    apply: () => 0,
    has: () => true,
  });
}

function cap(x, upper, lower) {
  return Math.max(Math.min(x, upper), lower);
}
function norm(x, y) {
  return Math.sqrt(x * x + y * y);
}
function toPInPI(theta) {
  const n = Math.trunc(Math.abs(theta / 2 / Math.PI)) + 1;
  return ((theta + Math.PI + 2 * n * Math.PI) % (2 * Math.PI)) - Math.PI;
}
function sigmoid(x, shift = 0, scale = 1) {
  return 1 / (1 + Math.exp(scale * (x - shift)));
}
function lineLength(l) {
  return norm(l.x1 - l.x0, l.y1 - l.y0);
}
function crossProduct(a, b) {
  return a[0] * b[1] - a[1] * b[0];
}
function innerProduct(a, b) {
  return a[0] * b[0] + a[1] * b[1];
}
function pointPerpDistToLine(p, l) {
  if (lineLength(l) === 0) return 0;
  let vLine;
  let vPoint;
  if (crossProduct([l.x0, l.y0], [l.x1, l.y1]) > 0) {
    vLine = [l.x0 - l.x1, l.y0 - l.y1];
    vPoint = [p.x - l.x1, p.y - l.y1];
  } else {
    vLine = [l.x1 - l.x0, l.y1 - l.y0];
    vPoint = [p.x - l.x0, p.y - l.y0];
  }
  return crossProduct(vLine, vPoint) / lineLength(l);
}
function pointMinDistToLine(p, l) {
  const AB = [l.x1 - l.x0, l.y1 - l.y0];
  const AP = [p.x - l.x0, p.y - l.y0];
  if (innerProduct(AB, AP) < 0) return norm(AP[0], AP[1]);
  const BA = [l.x0 - l.x1, l.y0 - l.y1];
  const BP = [p.x - l.x1, p.y - l.y1];
  if (innerProduct(BA, BP) < 0) return norm(BP[0], BP[1]);
  return Math.abs(pointPerpDistToLine(p, l));
}

/** printf-style formatting, enough for the log calls in the target functions. */
function format(fmt, ...args) {
  if (typeof fmt !== "string") return String(fmt);
  let i = 0;
  return fmt.replace(
    /%(-?\+?[0#\s]*)(\d+)?(?:\.(\d+))?(?:ll|l|h)?([dioxXufFeEgGscp%])/g,
    (match, flags, width, precision, conv) => {
      if (conv === "%") return "%";
      const raw = args[i];
      i += 1;
      let out;
      if (conv === "d" || conv === "i") out = String(Math.trunc(Number(raw) || 0));
      else if (conv === "f" || conv === "F") out = Number(raw || 0).toFixed(precision === undefined ? 6 : Number(precision));
      else if (conv === "e" || conv === "E") out = Number(raw || 0).toExponential(precision === undefined ? 6 : Number(precision));
      else if (conv === "s") out = raw === undefined || raw === null ? "" : String(raw);
      else if (conv === "x") out = (Math.trunc(Number(raw) || 0) >>> 0).toString(16);
      else if (conv === "X") out = (Math.trunc(Number(raw) || 0) >>> 0).toString(16).toUpperCase();
      else if (conv === "u") out = String(Math.abs(Math.trunc(Number(raw) || 0)));
      else out = String(raw);
      if (width) {
        const w = Number(width);
        out = flags.includes("-") ? out.padEnd(w) : out.padStart(w, flags.includes("0") ? "0" : " ");
      }
      return out;
    }
  );
}

/**
 * std::ostringstream, enough for the `ss << std::fixed << setprecision(2) << ...` chains
 * the decision nodes use to build their log lines. Manipulators are objects the stream
 * recognises; everything else is appended.
 */
const MANIP = { fixed: "__fixed", scientific: "__scientific", endl: "\n", boolalpha: "__bool" };

function makeStream() {
  let out = "";
  let precision = null;
  const stream = {
    __stream: true,
    write(v) {
      if (v && typeof v === "object" && v.__manip === "setprecision") {
        precision = v.n;
        return stream;
      }
      if (v === MANIP.fixed || v === MANIP.scientific || v === MANIP.boolalpha) return stream;
      if (typeof v === "number" && precision !== null) out += v.toFixed(precision);
      else if (typeof v === "boolean") out += v ? "1" : "0";
      else out += v === undefined || v === null ? "" : String(v);
      return stream;
    },
    str: () => out,
    clear: () => {
      out = "";
    },
  };
  return stream;
}

/** rclcpp::Time / Duration, backed by the simulation clock (seconds since reset). */
function makeTime(seconds) {
  return {
    __time: true,
    __s: seconds,
    seconds: () => seconds,
    nanoseconds: () => seconds * 1e9,
  };
}
function makeDuration(seconds) {
  return { __duration: true, __s: seconds, seconds: () => seconds };
}
function timeValue(t) {
  if (t === null || t === undefined) return 0;
  if (typeof t === "number") return t;
  if (t.__time || t.__duration) return t.__s;
  return 0;
}

export class SimHost {
  constructor({ role = "striker", onLog = null, ports = {}, instances = {}, portDefaults = {} } = {}) {
    this.role = role;
    this.onLog = onLog;
    this.ports = ports; // merged view from the BT XML, last tag wins
    this.instances = instances; // per-occurrence ports, keyed by tag
    this.portDefaults = portDefaults; // from brain_tree.h providedPorts()
    this.currentNode = null; // which node's ports getInput() should read
    this.currentDecision = null; // disambiguates sibling instances of the same node
    this.missingPorts = new Set();
    this.missingConfig = new Set();
    this.missingBrainMethods = new Set();

    this.simTime = 0; // seconds since reset
    this.command = { vx: 0, vy: 0, vtheta: 0 };
    this.lastCommand = { vx: 0, vy: 0, vtheta: 0 };
    this.telemetry = {};
    // RobotClient::moveToPoseOnField2's function-local statics -- shared across every
    // caller, not per node, matching the real C++ scoping. See buildClient() below.
    this._moveToPoseState = { mode: "longRange", isBacking: false, timeEndAvoid: 0, avoidDir: 1.0 };

    this.blackboard = {
      ball_location_known: true,
      tm_ball_pos_reliable: false,
      ball_out: false,
      player_role: role,
      decision: "",
      gc_game_state: "PLAY",
      gc_game_sub_state_type: "NONE",
      gc_set_play_type: "NONE",
      gc_is_sub_state_kickoff_side: false,
      penalty_kick_target_latched: false,
      penalty_kick_target_y: 0,
      penalty_kick_dir: 0,
      direct_freekick_blindstrike_override: false,
      indirect_freekick_blindstrike_override: false,
      wait_for_opponent_kickoff: false,
      goalie_should_track_ball: true,
      known_ball_zone_far: false,
      force_panorama_sweep: false,
      ball_detected: true,
      // Read by GoToGoalBlockingPosition::tick's penalty-defence branch; always false
      // here since GameController state is fixed to normal PLAY.
      local_freekick_is_penalty: false,
      local_freekick_phase: "NONE",
    };

    this.data = this.buildData();
    this.config = this.buildConfig();
    this.client = this.buildClient();
    this.tree = this.buildTree();
    this.log = this.buildLog();
    this.brain = this.buildBrain();
  }

  reset(role) {
    if (role) {
      this.role = role;
      this.blackboard.player_role = role;
      this.data.chaseScore.role = role;
    }
    this.simTime = 0;
    this.command = { vx: 0, vy: 0, vtheta: 0 };
    this.lastCommand = { vx: 0, vy: 0, vtheta: 0 };
    this.telemetry = {};
    this.missingPorts.clear();
    this.missingConfig.clear();
    this.missingBrainMethods.clear();
    this._moveToPoseState = { mode: "longRange", isBacking: false, timeEndAvoid: 0, avoidDir: 1.0 };
    this.blackboard.decision = "";
    this.data.lastKickExitTime = makeTime(-3600);
    this.data.lastSuccessfulLocalizeTime = makeTime(0);
    this.data.kickDir = 0;
    this.data.kickType = "shoot";
  }

  // ------------------------------------------------------------------ data

  buildData() {
    const self = this;
    return {
      ball: {
        posToRobot: { x: 0, y: 0, z: 0 },
        posToField: { x: 0, y: 0, z: 0 },
        range: 0,
        yawToRobot: 0,
        pitchToRobot: 0,
        confidence: 100,
        timePoint: makeTime(0),
        label: "Ball",
        name: "Ball",
      },
      tmBall: { posToField: { x: 0, y: 0, z: 0 }, range: 0 },
      robotPoseToField: { x: 0, y: 0, theta: 0 },
      robotBallAngleToField: 0,
      ballDetected: true,
      kickDir: 0,
      kickType: "shoot",
      lastKickExitTime: makeTime(-3600),
      lastSuccessfulLocalizeTime: makeTime(0),
      roleJustChanged: false,
      goalieJustAssigned: false,
      lose_ball: false,
      isFreekickKickingOff: false,
      tmImLead: true,
      tmImInVisualKick: false,
      tmMyCost: 0,
      tmMyCostRank: 0,
      myStrikerIDRank: 0,
      latestTmBallZone: 0,
      goalBlockingTarget: { x: 0, y: 0, z: 0 },
      goalBlockingYaw: 0,
      useCustomBlockingTarget: false,
      // BrainData::oppoLiveCount (brain_data.h:56) defaults to 0 -- opponents not
      // tracked, GameController state fixed to PLAY -- which is also the struct's own
      // default before any GameController packet updates it.
      oppoLiveCount: 0,
      localFreekickTargetUpdateTime: makeTime(0),

      // ChaseScoreBreakdown (brain_data.h:186). Only used for logging in the nodes the
      // simulator runs; the defaults are the struct's own, so the log lines read sanely.
      // `role` is the one exception: updateCostToKick() (brain.cpp) is what normally
      // assigns it from player_role each tick, and it isn't part of the paste contract
      // (only brain_tree.cpp is interpreted), so it never runs here. Since that assignment
      // is a straight passthrough of player_role, we can mirror it correctly without
      // running the rest of the (unmodeled) scoring math -- see reset() below, which keeps
      // this in sync if the role changes without rebuilding the host.
      chaseScore: {
        role: self.role,
        score: 100.0,
        distanceScore: 1.0,
        timeScore: 1.0,
        headingScore: 1.0,
        goalAngleScore: 1.0,
        obstaclePenalty: 0.0,
        fallenPenalty: 0.0,
        confidencePenalty: 0.0,
        ballRange: 0.0,
        estimatedTime: 0.0,
        ballAge: 0.0,
        obstacleDist: 0.0,
        goalieScore: 100.0,
        bestTeammateId: 0,
        bestTeammateScore: 100.0,
      },
      tmRobots: [],
      teammates: [],
      currentRole: () => self.role,

      // BrainData::field2robot / robot2field (brain_data.cpp:48-71)
      field2robot(pose) {
        const r = self.data.robotPoseToField;
        const dx = pose.x - r.x;
        const dy = pose.y - r.y;
        const c = Math.cos(r.theta);
        const s = Math.sin(r.theta);
        return {
          x: dx * c + dy * s,
          y: -dx * s + dy * c,
          theta: toPInPI((pose.theta || 0) - r.theta),
        };
      },
      robot2field(pose) {
        const r = self.data.robotPoseToField;
        const c = Math.cos(r.theta);
        const s = Math.sin(r.theta);
        return {
          x: r.x + pose.x * c - pose.y * s,
          y: r.y + pose.x * s + pose.y * c,
          theta: toPInPI((pose.theta || 0) + r.theta),
        };
      },
      getGoalposts: () => [],
      getFieldLines: () => [],
    };
  }

  // ---------------------------------------------------------------- config

  buildConfig() {
    const self = this;
    const cfg = {
      fieldDimensions: { ...FD },
    };
    // Expose every value as both get_x() and the raw key, since the C++ uses getters.
    for (const key of Object.keys(CONFIG_DEFAULTS)) {
      const getterName = `get_${key}`;
      cfg[getterName] = () => CONFIG_DEFAULTS[key];
    }
    // Anything the pasted code asks for that we do not model: return a safe default and
    // report it, rather than throwing mid-tick.
    return new Proxy(cfg, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === "string" && prop.startsWith("get_")) {
          self.missingConfig.add(prop);
          return () => 0;
        }
        return undefined;
      },
      has: () => true,
    });
  }

  // ---------------------------------------------------------------- client

  buildClient() {
    const self = this;
    return {
      setVelocity(x, y, theta, vxLimitOverride) {
        const limit = vxLimitOverride === undefined ? CONFIG_DEFAULTS.vx_limit : vxLimitOverride;
        self.command = {
          vx: cap(Number(x) || 0, limit, -limit),
          vy: cap(Number(y) || 0, CONFIG_DEFAULTS.vy_limit, -CONFIG_DEFAULTS.vy_limit),
          vtheta: cap(Number(theta) || 0, CONFIG_DEFAULTS.vtheta_limit, -CONFIG_DEFAULTS.vtheta_limit),
        };
        self.lastCommand = { ...self.command };
        return 0;
      },
      // RobotClient::crabWalk (robot_client.cpp:129) -- walk sideways along `angle`
      // (robot frame) at `speed`, without turning.
      crabWalk(angle, speed) {
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        return self.client.setVelocity(vx, vy, 0);
      },
      getVx: () => self.lastCommand.vx,
      getVy: () => self.lastCommand.vy,
      getVtheta: () => self.lastCommand.vtheta,
      moveHead: () => 0,
      waveHand: () => 0,
      standUp: () => 0,
      robocupWalk: () => 0,
      enterDamping: () => 0,
      RLVisionKick: () => 0,
      isStandingStill: () => false,
      msecsToCollide: () => 1e6,
      moveToPoseOnField: () => 0,
      // RobotClient::moveToPoseOnField2 (robot_client.cpp:255). This is a robot_client.cpp
      // primitive, not part of brain_tree.cpp, so -- like crabWalk and setVelocity -- it is
      // implemented natively here rather than expected in the paste. GoToGoalBlockingPosition
      // (goalkeeper 'retreat') delegates its entire walk-to-pose behaviour to this function;
      // without a faithful implementation the goalkeeper would compute a correct target pose
      // and then never move toward it.
      //
      // The mode/isBacking/timeEndAvoid/avoidDir statics are function-local statics in the
      // C++, meaning ONE instance shared by every caller in the whole process, not per node
      // -- self._moveToPoseState below replicates that scoping exactly.
      moveToPoseOnField2(tx, ty, ttheta, longRangeThreshold, turnThreshold, vxLimit, vyLimit, vthetaLimit, xTolerance, yTolerance, thetaTolerance, avoidObstacle) {
        const st = self._moveToPoseState;
        const SAFE_DIST = CONFIG_DEFAULTS.safe_distance;
        const AVOID_SECS = CONFIG_DEFAULTS.avoid_secs;

        const robotPose = self.data.robotPoseToField;
        const range = norm(tx - robotPose.x, ty - robotPose.y);
        st.mode = range > longRangeThreshold * (st.mode === "longRange" ? 0.9 : 1.0) ? "longRange" : "shortRange";

        const tarDir = Math.atan2(ty - robotPose.y, tx - robotPose.x);
        const faceDir = robotPose.theta;
        const tarDirR = toPInPI(tarDir - faceDir);
        const now = self.simTime;

        let vx = 0;
        let vy = 0;
        let vtheta = 0;
        let effVxLimit = vxLimit;

        if (st.mode === "longRange") {
          if (Math.abs(tarDirR) > turnThreshold) {
            vtheta = tarDirR;
          } else {
            vx = cap(range, vxLimit, -vxLimit);
            vtheta = tarDirR;
          }

          if (avoidObstacle) {
            if (now < st.timeEndAvoid) {
              const distFwd = self.brain.distToObstacle(0);
              if (distFwd < SAFE_DIST / 2) {
                st.isBacking = true;
                st.timeEndAvoid = now + AVOID_SECS;
                st.avoidDir = self.brain.calcAvoidDir(tarDirR, SAFE_DIST) > 0 ? 1 : -1;
                vx = -0.2;
                vy = st.avoidDir * 0.2;
                vtheta = 0;
              } else if (self.brain.distToObstacle(0) < SAFE_DIST + (st.isBacking ? 0.5 : 0)) {
                st.isBacking = false;
                st.timeEndAvoid = now + AVOID_SECS;
                st.avoidDir = self.brain.calcAvoidDir(tarDirR, SAFE_DIST) > 0 ? 1 : -1;
                vx = 0;
                vy = 0;
                vtheta = st.avoidDir * CONFIG_DEFAULTS.vtheta_limit;
              } else {
                vx = vxLimit;
                if (self.brain.distToObstacle(tarDirR) < SAFE_DIST * 2) effVxLimit *= 0.5;
                vy = 0;
                vtheta = 0;
              }
            } else {
              const distFwd = self.brain.distToObstacle(tarDirR);
              if (distFwd < SAFE_DIST * 2) effVxLimit = 0.5;
              if (distFwd < SAFE_DIST) {
                st.timeEndAvoid = now + AVOID_SECS;
                st.avoidDir = self.brain.calcAvoidDir(tarDirR, SAFE_DIST) > 0 ? 1 : -1;
                vx = 0;
                vy = 0;
                vtheta = 0;
              }
            }
          }
        } else {
          // shortRange: direct holonomic approach.
          vx = range * Math.cos(tarDirR);
          vy = range * Math.sin(tarDirR);
          vtheta = toPInPI(ttheta - faceDir);
          if (Math.abs(vx) < xTolerance && Math.abs(vy) < yTolerance && Math.abs(vtheta) < thetaTolerance) {
            vx = 0;
            vy = 0;
            vtheta = 0;
          }
          if (avoidObstacle) {
            const distToObstacle = self.brain.distToObstacle(tarDirR);
            if (distToObstacle < SAFE_DIST) {
              vx = 0;
              vy = 0;
              vtheta = tarDirR;
            }
          }
        }

        vx = cap(vx, effVxLimit, -effVxLimit);
        vy = cap(vy, vyLimit, -vyLimit);
        vtheta = cap(vtheta, vthetaLimit, -vthetaLimit);
        return self.client.setVelocity(vx, vy, vtheta);
      },
      moveToPoseOnField3: () => 0,
    };
  }

  // ----------------------------------------------------------------- tree

  buildTree() {
    const self = this;
    const getEntry = (key) => {
      if (Object.prototype.hasOwnProperty.call(self.blackboard, key)) return self.blackboard[key];
      return "";
    };
    return {
      getEntry,
      setEntry: (key, value) => {
        self.blackboard[key] = value;
        return true;
      },
      hasEntry: (key) => Object.prototype.hasOwnProperty.call(self.blackboard, key),
    };
  }

  // ------------------------------------------------------------------ log

  buildLog() {
    const emit = (level) => (scope, msg) => {
      if (this.onLog) this.onLog({ level, scope: String(scope), msg: String(msg === undefined ? "" : msg), t: this.simTime });
    };
    return {
      debug: emit("debug"),
      strategy: emit("strategy"),
      info: emit("info"),
      warn: emit("warn"),
      error: emit("error"),
      log: emit("log"),
      log_scalar: () => {},
      setTimeNow: () => {},
    };
  }

  // ---------------------------------------------------------------- brain

  buildBrain() {
    const self = this;
    const brain = {
      data: this.data,
      config: this.config,
      client: this.client,
      tree: this.tree,
      log: this.log,

      get_clock: () => ({ now: () => makeTime(self.simTime) }),
      get_logger: () => ({}),
      msecsSince: (t) => (self.simTime - timeValue(t)) * 1000,

      // Single robot, empty pitch.
      distToObstacle: () => NO_OBSTACLE_DIST,
      distToBall: () => NO_OBSTACLE_DIST,
      calcAvoidDir: (dir) => dir,
      isDefensing: () => false,

      // brain.cpp:2257
      getGoalPostAngles: (margin) => {
        const oppGoalX = -CONFIG_DEFAULTS.goal_center_x;
        const leftX = oppGoalX;
        const rightX = oppGoalX;
        const leftY = oppGoalX > 0 ? FD.goalWidth / 2 : -FD.goalWidth / 2;
        const rightY = oppGoalX > 0 ? -FD.goalWidth / 2 : FD.goalWidth / 2;
        const m = Number(margin) || 0;
        const leftYOffset = leftY > 0 ? leftY - m : leftY + m;
        const rightYOffset = rightY > 0 ? rightY - m : rightY + m;
        const b = self.data.ball.posToField;
        return [
          Math.atan2(leftYOffset - b.y, leftX - b.x),
          Math.atan2(rightYOffset - b.y, rightX - b.x),
        ];
      },

      // brain.cpp:2415
      isAngleGood: (goalPostMargin, type) => {
        let angle = 0;
        if (type === "kick") angle = self.data.robotBallAngleToField;
        if (type === "shoot") angle = self.data.robotPoseToField.theta;
        let [thetaL, thetaR] = self.brain.getGoalPostAngles(goalPostMargin);
        const width = Math.abs(toPInPI(thetaL - thetaR));
        if (width < (Math.PI / 3) * 2) {
          [thetaL, thetaR] = self.brain.getGoalPostAngles(0.5);
        }
        let diffL = toPInPI(thetaL - thetaR);
        let diffA = toPInPI(angle - thetaR);
        if (diffL < 0) diffL += 2 * Math.PI;
        if (diffA < 0) diffA += 2 * Math.PI;
        return diffA < diffL;
      },

      isBallOut: () => false,
      distToBorder: () => 0,
      calcKickDir: (margin) => {
        const [thetaL, thetaR] = self.brain.getGoalPostAngles(margin || 0);
        return toPInPI((thetaL + thetaR) / 2);
      },
    };

    // The target functions call a long tail of Brain methods that only publish to ROS
    // topics or read teammate state -- publishPlayerDecision, updateBallOut, and so on.
    // None of them can affect a single robot on an empty pitch, so an unknown Brain
    // method is inert and reported rather than fatal. Missing *data* fields still throw,
    // because a wrong number there would silently change the robot's behaviour.
    return new Proxy(brain, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === "string") {
          self.missingBrainMethods.add(prop);
          return inertMember();
        }
        return undefined;
      },
      has: () => true,
    });
  }

  // -------------------------------------------------------------- getInput

  /**
   * BehaviorTree.CPP getInput(). Two forms appear in the code:
   *   getInput("vx_limit", vxLimit)          -> writes through the reference
   *   getInput<double>("min_msec_kick").value() -> returns an optional-like
   */
  /** StrikerChase/GoalieChase/DefenderChase inherit Chase::providedPorts(). */
  static portChain(node) {
    return node === "StrikerChase" || node === "GoalieChase" || node === "DefenderChase"
      ? [node, "Chase"]
      : [node];
  }

  /**
   * Resolve a port without recording it as missing. Used before a run to decide whether
   * the paste supplies everything the code reads.
   */
  resolvePortStatically(node, portName, decision = null) {
    const chain = SimHost.portChain(node);
    for (const candidate of chain) {
      // Prefer the XML instance whose _while guard matches the decision being executed,
      // so the crossing <Kick> does not inherit the shooting <Kick>'s ports.
      const fromXml = selectInstance(this.instances, this.ports, candidate, decision);
      if (fromXml && Object.prototype.hasOwnProperty.call(fromXml, portName)) {
        return { value: this.derefBlackboard(fromXml[portName]), source: "xml" };
      }
    }
    for (const candidate of chain) {
      const defs = this.portDefaults[candidate];
      if (defs && Object.prototype.hasOwnProperty.call(defs, portName)) {
        return { value: defs[portName], source: "header" };
      }
    }
    return { value: undefined, source: null };
  }

  lookupPort(portName) {
    const node = this.currentNode;
    const hit = this.resolvePortStatically(node, portName, this.currentDecision);
    if (hit.source) return hit;
    this.missingPorts.add(`${node}.${portName}`);
    return { value: 0, source: null };
  }

  /** `decision_in="{decision}"` reads the blackboard rather than a literal. */
  derefBlackboard(value) {
    if (typeof value === "string" && /^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value)) {
      const key = value.slice(1, -1);
      return Object.prototype.hasOwnProperty.call(this.blackboard, key) ? this.blackboard[key] : "";
    }
    return value;
  }

  /** setOutput("decision_out", v) -> resolve the XML mapping and write the blackboard. */
  writeOutput(portName, value) {
    const node = this.currentNode;
    const mapping = this.ports[node] && this.ports[node][portName];
    if (typeof mapping === "string" && /^\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(mapping)) {
      this.blackboard[mapping.slice(1, -1)] = value;
      return true;
    }
    // No XML mapping: store under the port name so the value is at least observable.
    this.blackboard[portName] = value;
    this.missingPorts.add(`${node}.${portName} (output)`);
    return true;
  }

  // ------------------------------------------------------------- lifecycle

  /** Refresh everything the brain reads from the physics world. Called once per tick. */
  syncFromWorld(world) {
    this.simTime = world.t;
    const rel = ballToRobot(world);
    const d = this.data;

    d.ball.posToRobot.x = rel.x;
    d.ball.posToRobot.y = rel.y;
    d.ball.posToField.x = world.ball.x;
    d.ball.posToField.y = world.ball.y;
    d.ball.range = rel.range;
    d.ball.yawToRobot = rel.yaw;
    d.ball.timePoint = makeTime(world.t);
    d.ball.confidence = 100;

    d.robotPoseToField.x = world.robot.x;
    d.robotPoseToField.y = world.robot.y;
    d.robotPoseToField.theta = world.robot.theta;
    // Field-frame bearing from robot to ball (BrainData::robotBallAngleToField).
    d.robotBallAngleToField = Math.atan2(world.ball.y - world.robot.y, world.ball.x - world.robot.x);

    // Perfect perception, as chosen: the ball is always known.
    d.ballDetected = true;
    this.blackboard.ball_detected = true;
    this.blackboard.ball_location_known = true;
    this.blackboard.player_role = this.role;
  }

  /** Build the globals table handed to the interpreter. */
  globals() {
    const self = this;

    const getInput = function getInputImpl(portName, ref) {
      const { value } = self.lookupPort(String(portName));
      if (ref && typeof ref.set === "function") {
        ref.set(value);
        return true;
      }
      // Expression form: getInput<double>("x").value()
      return {
        value: () => value,
        has_value: () => true,
      };
    };
    getInput.refParams = [1];

    const setOutput = (portName, value) => self.writeOutput(String(portName), value);

    const g = {
      // --- math / utils (include/utils/math.h) ---
      fabs: Math.abs,
      abs: Math.abs,
      fmod: (a, b) => a % b,
      min: Math.min,
      max: Math.max,
      atan2: Math.atan2,
      atan: Math.atan,
      asin: Math.asin,
      acos: Math.acos,
      cos: Math.cos,
      sin: Math.sin,
      tan: Math.tan,
      exp: Math.exp,
      log: Math.log,
      sqrt: Math.sqrt,
      pow: Math.pow,
      floor: Math.floor,
      ceil: Math.ceil,
      round: Math.round,
      hypot: Math.hypot,
      isnan: Number.isNaN,
      isinf: (v) => !Number.isFinite(v) && !Number.isNaN(v),
      M_PI: Math.PI,
      M_PI_2: Math.PI / 2,
      M_E: Math.E,
      cap,
      norm,
      toPInPI,
      sigmoid,
      lineLength,
      crossProduct,
      innerProduct,
      pointPerpDistToLine,
      pointMinDistToLine,
      format,

      // --- BehaviorTree.CPP ---
      getInput,
      setOutput,
      NodeStatus: { SUCCESS: "SUCCESS", FAILURE: "FAILURE", RUNNING: "RUNNING", IDLE: "IDLE" },

      // --- rclcpp ---
      rclcpp: {
        Time: (sec) => makeTime(typeof sec === "number" ? sec / 1e9 : 0),
        Duration: { from_seconds: (s) => makeDuration(s) },
        ok: () => true,
      },
      RCL_ROS_TIME: 0,

      // --- STL odds and ends the log-building code uses ---
      string: (v) => (v === undefined ? "" : String(v)),
      to_string: (v) => String(v),
      stod: (v) => Number(v),
      stoi: (v) => Math.trunc(Number(v)),
      ostringstream: makeStream,
      stringstream: makeStream,
      setprecision: (n) => ({ __manip: "setprecision", n }),
      setw: () => ({ __manip: "setw" }),
      fixed: MANIP.fixed,
      scientific: MANIP.scientific,
      boolalpha: MANIP.boolalpha,
      endl: MANIP.endl,

      // --- structs constructible by name ---
      Pose2D: (x = 0, y = 0, theta = 0) => ({ x, y, theta }),
      Point: (x = 0, y = 0, z = 0) => ({ x, y, z }),
      Point2D: (x = 0, y = 0) => ({ x, y }),
      Line: (x0 = 0, y0 = 0, x1 = 0, y1 = 0) => ({ x0, y0, x1, y1 }),

      // --- the brain itself ---
      brain: this.brain,
      // `*this` inside a node's tick() is the node; the only members the target
      // functions use on it are the port accessors.
      this: { getInput, setOutput },

      // --- game-state helpers that are out of scope for a single-robot open-play sim ---
      // These live in brain_tree.cpp but depend on GameController state the sim does not
      // model. Providing them here keeps the extractor from pulling in code that could
      // never be exercised. Every one of them is inert in normal play, which is the only
      // state this simulator runs.
      isAttackingCornerKickContext: () => false,
      isAttackingThrowIn: () => false,
      isAttackingDirectFreeKick: () => false,
      isAttackingIndirectFreeKick: () => false,
      isAttackingFreeKick: () => false,
      hasLatestTmBallZone: () => false,
      hasRobotNearBall: () => false,
      releaseIndirectFreekickPassToPlay: () => {},
      zoneCenterPoint: () => ({ x: 0, y: 0, z: 0 }),
      passSourcePoint: () => ({ x: 0, y: 0, z: 0 }),
      straightKickFailureReason: () => "",
      kickContext: () => "open_play",
      prtErr: () => {},
      prtWarn: () => {},
      prtDebug: () => {},
    };

    // std:: names resolve through the interpreter's `::` tail fallback, but register the
    // common ones explicitly so lookups are direct.
    g["std::min"] = Math.min;
    g["std::max"] = Math.max;
    g["std::abs"] = Math.abs;
    g["std::fabs"] = Math.abs;
    g["std::exp"] = Math.exp;
    g["std::floor"] = Math.floor;
    g["std::round"] = Math.round;
    g["std::sqrt"] = Math.sqrt;
    g["std::isnan"] = Number.isNaN;
    g["std::setprecision"] = g.setprecision;
    g["std::setw"] = g.setw;
    g["std::fixed"] = MANIP.fixed;
    g["std::scientific"] = MANIP.scientific;
    g["std::endl"] = MANIP.endl;
    g["std::ostringstream"] = makeStream;
    g["std::stringstream"] = makeStream;
    g["std::to_string"] = (v) => String(v);
    g["std::string"] = g.string;
    g["NodeStatus::SUCCESS"] = "SUCCESS";
    g["NodeStatus::FAILURE"] = "FAILURE";
    g["NodeStatus::RUNNING"] = "RUNNING";

    void self;
    return g;
  }
}

export { cap, norm, toPInPI, sigmoid, format, makeTime, makeDuration, timeValue, NO_OBSTACLE_DIST };
