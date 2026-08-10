import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import { CircleCheck, RefreshCw, Eye, X } from "lucide-react";
import StatusIndicator from "../components/StatusIndicator.jsx";
import InfoHint from "../components/InfoHint.jsx";
import RoleToggle from "../components/RoleToggle.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import Notice from "../components/Notice.jsx";
import GlassButton, { GlassButtonFilter } from "../components/GlassButton.jsx";
import GlassSlider from "../components/GlassSlider.jsx";
import ViewTabs from "../components/ViewTabs.jsx";
import TestCard from "../components/TestCard.jsx";
import ApproachKickTestFlow from "../components/ApproachKickTestFlow.jsx";
import CompareResultsFlow from "../components/CompareResultsFlow.jsx";
import testDefinitions from "../content/testDefinitions.js";
import SLIDERS from "../content/physicsSliders.js";
import { SPRING_UI, SPRING_MAGNETIC, SPRING_CLICK, SPRING_SPLIT } from "../lib/motionSpring.js";
import { applyMagneticPull } from "../lib/magneticPull.js";
import { TABS, INTRO, CONFIG_NOTE, expectedRelPath } from "../content/simulatorPasteGuide.js";
import { buildProgram } from "../lib/sim/runtime.js";
import { createWorld, stepWorld, DEFAULT_PHYSICS, terminalResultFor } from "../lib/sim/physics.js";
import { createEngine, FIXED_DT } from "../lib/sim/engine.js";
import { createRenderer } from "../lib/sim/renderer.js";
import { VIEW_W, VIEW_H, toField } from "../lib/sim/field.js";
import { CONFIG_DEFAULTS } from "../lib/sim/host.js";
import { runSelfTest } from "../lib/cpp/selftest.js";
import { REQUIRED_BY_ROLE } from "../lib/cpp/extract.js";
import HeroField from "./HeroField.jsx";
import footballIcon from "../images/icons/football.png";
import { useScrollScrub } from "../lib/useScrollScrub.js";
import "./RobotSimulator.css";

// v2: sources.xml became { [roleId]: text } — both roles' behaviour trees are
// extracted on scan now instead of just the selected role's, so switching
// role no longer waits on a re-read. Bumped so a v1 cache (a bare string)
// cannot be read back into the new shape.
const STORAGE_KEY = "robot-simulator-source-v2";

// The progress bar's 3 stops: pick a role/folder, validate what was found,
// hand off to the simulation. "Simulation" is only ever reached by leaving
// this step, so the bar's own visible max while still on this page is 2/3.
const PROGRESS_STOPS = ["Setup", "Checks", "Simulation"];

// Where the hero's ball is headed along its trajectory. The page entrance
// carries it to the halfway mark (HeroField holds it at the start of the
// path until its own slide-in has landed, so the travel is actually
// watchable), Load & Check finishes the shot into the goal, and going back
// via Edit setup retreats it to the halfway mark again — the ball tracks
// which stage the card is showing.
const HERO_KICK_ENTERED = 0.5;
const HERO_KICK_CHECKED = 1;

const ROLES = [
  { id: "striker", label: "Striker" },
  { id: "goal_keeper", label: "Goalkeeper" },
];

const INITIAL_PLACEMENT = {
  striker: { robot: { x: -2, y: 0, theta: 0 }, ball: { x: 2, y: 0 } },
  goal_keeper: { robot: { x: -6.5, y: 0, theta: 0 }, ball: { x: -5, y: 0.8 } },
};

// Matches a wanted relative path (e.g. "include/brain_tree.h") against every file the
// user's folder picker returned, by suffix — the user may have opened the repo root, just
// src/brain, or anything in between, so the match can't assume a fixed depth. When several
// files share a suffix (e.g. a build output that duplicated the tree), the shortest full
// path wins as the least-nested, most-likely-canonical copy.
function findFolderMatch(files, relPath) {
  const wanted = "/" + relPath.toLowerCase();
  let best = null;
  for (const f of files) {
    const p = f.relPath.toLowerCase();
    if (p === relPath.toLowerCase() || p.endsWith(wanted)) {
      if (!best || f.relPath.length < best.relPath.length) best = f;
    }
  }
  return best;
}

function loadStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function RobotSimulator() {
  const stored = useMemo(loadStored, []);

  const [step, setStep] = useState("edit");
  // The edit step's own two-stage flow: pick role/source, then review what
  // was found before handing off to the run step. Independent of `step` —
  // `step` is which page renders, `stage` is where the edit page itself is.
  const [stage, setStage] = useState("setup");
  const [role, setRole] = useState((stored && stored.role) || "striker");
  // xml is keyed by role — both the striker and goalkeeper behaviour trees
  // are read out of the folder on scan, not just the one the role toggle
  // currently points at.
  const [sources, setSources] = useState(
    (stored && stored.sources) || { cpp: "", xml: { striker: "", goal_keeper: "" }, header: "" }
  );
  const [report, setReport] = useState(null);
  const [buildError, setBuildError] = useState(null);
  const [selfTest, setSelfTest] = useState(null);
  const [running, setRunning] = useState(false);
  // The Approach & Kick Time test flow (ApproachKickTestFlow) and the
  // navigation-blocking it needs while its 108 headless runs are in
  // flight — see the effects below and the .rs-back/ViewTabs gating in
  // SimStep. Owned here rather than inside the flow component itself
  // because blocking the back button, the view tabs, and browser
  // navigation all require reaching outside that component.
  const [testFlowOpen, setTestFlowOpen] = useState(false);
  const [testRunning, setTestRunning] = useState(false);
  const [compareFlowOpen, setCompareFlowOpen] = useState(false);
  // Mirrors `running` for the drag handlers below: those pointer listeners
  // are attached once per step/onRender change, not once per render, so
  // reading `running` directly would close over a stale value.
  const runningRef = useRef(running);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  const [physics, setPhysics] = useState({ ...DEFAULT_PHYSICS, stanceBias: CONFIG_DEFAULTS.stance_bias });
  const [placement, setPlacement] = useState(INITIAL_PLACEMENT.striker);
  const [overrun, setOverrun] = useState(false);
  const [runtimeError, setRuntimeError] = useState(null);
  // The decision pill is a real React-rendered GlassButton now (see SimStep),
  // not an imperatively-painted DOM node — but paintReadout still runs on
  // every animation frame, and re-rendering on every one of those would
  // dominate the frame budget the same way repainting the stat rows through
  // React would. lastDecisionRef (below, with the other refs) lets onRender
  // dedupe: it only calls setDecisionState when the bucket/text actually
  // changed, which is far rarer than every tick (the decision only flips
  // when the behaviour tree takes a different branch).
  const [decisionState, setDecisionState] = useState({ bucket: "idle", text: "—" });
  const [folderScan, setFolderScan] = useState(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [heroKick, setHeroKick] = useState(HERO_KICK_ENTERED);
  // Whether the trail button is currently recording new points — mirrors
  // world.trailTracking (physics.js), which is what actually gates the
  // recording; this copy only drives the button's own selected/aria state.
  // Turning it off does not hide or clear the line already drawn — see
  // onToggleTrail/onClearTrail below. Starts true to match
  // world.trailTracking's own default (physics.js) — the path records from
  // the first step of a run without the button needing a press first.
  const [trailTracking, setTrailTracking] = useState(true);

  const svgRef = useRef(null);
  const folderInputRef = useRef(null);
  const rendererRef = useRef(null);
  const engineRef = useRef(null);
  const worldRef = useRef(null);
  const runtimeRef = useRef(null);
  const readoutRef = useRef(null);
  const detailRef = useRef(null);
  const notesRef = useRef(null);
  const logRef = useRef(null);
  const logCountRef = useRef(0);
  const placementRef = useRef(placement);
  const physicsRef = useRef(physics);
  const lastDecisionRef = useRef({ bucket: "idle", text: "—" });
  // The rAF callbacks must have stable identities: they are dependencies of the effect
  // that builds the engine, so anything that changes them tears down and rebuilds the
  // whole scene mid-run. Everything they touch therefore lives in a ref, and React state
  // is only written when a value actually changes.
  const errorRef = useRef(null);
  const overrunRef = useRef(false);
  // True from the moment a drag actually moves the robot or ball until the
  // next real brain tick. runtime.telemetry.curve/target (the planned kick
  // path and the chase target) are only ever written by a tick — dragging
  // doesn't tick the brain, so the instant either handle moves, both are
  // describing a placement that no longer exists. Gating strictly on
  // "currently dragging" isn't enough: releasing the pointer used to let
  // that same stale telemetry reappear, since nothing had actually
  // recomputed it yet. Read by onRender (below) to hide both while this is
  // true, and only cleared inside onStep once runtime.tick() has genuinely
  // produced a fresh value — i.e. once the sim is resumed and takes its
  // first step at the new placement.
  const telemetryStaleRef = useRef(false);
  // Ball-vision debug overlays (SimStep's "Limit Ball Vision" cluster).
  // Plain refs, not state — onRender has an empty dependency list (see the effect
  // that builds the engine below) and reads these fresh every frame, the same
  // convention physicsRef/placementRef already follow. Reset to false at both
  // points runtimeRef.current is rebuilt, in parity with the fresh SimHost's own
  // usePreciseBall default.
  const showFovRef = useRef(false);
  const showPerceivedRef = useRef(false);
  // Holds the latest onRender (defined further down, after the engine/renderer
  // refs it closes over) so these two toggles — and the physics-slider effect
  // below — can force an immediate repaint without waiting on onRender's own
  // declaration order. onRender's identity is stable ([] deps), so this is set
  // once and never needs to change; see the effect that assigns it.
  const onRenderRef = useRef(null);
  const onSetShowFov = useCallback((v) => {
    showFovRef.current = v;
    // The rAF loop only calls onRender while playing (engine.js's frame()) — paused,
    // toggling this would otherwise sit invisible until Resume or Step. Force one
    // repaint now so the FOV cone appears (or disappears) the instant it's clicked.
    if (engineRef.current && !engineRef.current.isRunning()) onRenderRef.current?.();
  }, []);
  const onSetShowPerceivedBall = useCallback((v) => {
    showPerceivedRef.current = v;
    if (engineRef.current && !engineRef.current.isRunning()) onRenderRef.current?.();
  }, []);

  useEffect(() => {
    document.title = "Robot Simulator — Chase / Adjust / Kick";
  }, []);

  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);
  useEffect(() => {
    physicsRef.current = physics;
  }, [physics]);

  // ---------------------------------------------------- test navigation lock

  // Blocks in-app back/forward while the Approach & Kick Time test is
  // running. HashRouter (App.jsx) is not a data router, so react-router's
  // useBlocker (which requires createBrowserRouter) isn't available here —
  // this re-pushes the current location the instant a popstate fires mid-test,
  // the standard non-data-router pattern. Combined with disabling .rs-back
  // and the view tabs (SimStep, below) and the beforeunload guard right
  // after this effect, these are the only real navigation vectors: the run
  // step renders no site header/nav of its own to worry about.
  useEffect(() => {
    if (!testRunning) return undefined;
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [testRunning]);

  // Tab close/refresh while the test is running — triggers the browser's
  // own native confirmation prompt.
  useEffect(() => {
    if (!testRunning) return undefined;
    const onBeforeUnload = (evt) => {
      evt.preventDefault();
      evt.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [testRunning]);

  // ------------------------------------------------------------- folder open

  // Both roles' behaviour trees are read out of the folder in one pass —
  // the XML is the only file that differs per role (subtree_striker_play.xml
  // vs. subtree_goal_keeper_play.xml), so extracting both up front means the
  // role toggle can switch instantly afterwards with no re-read, and the
  // simulation always runs the role selected at that instant rather than
  // whichever one happened to be loaded last.
  const scanFolder = useCallback(async (files) => {
    setFolderBusy(true);
    const results = [];
    const nextSources = { xml: {} };
    for (const t of TABS) {
      if (t.id === "xml") continue;
      const relPath = expectedRelPath(t.id);
      const match = findFolderMatch(files, relPath);
      if (!match) {
        results.push({ tabId: t.id, path: relPath, found: false });
        continue;
      }
      try {
        nextSources[t.id] = await match.file.text();
        results.push({ tabId: t.id, path: relPath, found: true, matchedPath: match.relPath });
      } catch (err) {
        results.push({ tabId: t.id, path: relPath, found: false, error: String((err && err.message) || err) });
      }
    }
    for (const r of ROLES) {
      const relPath = expectedRelPath("xml", r.id);
      const match = findFolderMatch(files, relPath);
      if (!match) {
        results.push({ tabId: "xml", roleId: r.id, path: relPath, found: false });
        continue;
      }
      try {
        nextSources.xml[r.id] = await match.file.text();
        results.push({ tabId: "xml", roleId: r.id, path: relPath, found: true, matchedPath: match.relPath });
      } catch (err) {
        results.push({ tabId: "xml", roleId: r.id, path: relPath, found: false, error: String((err && err.message) || err) });
      }
    }
    setSources((prev) => ({ ...prev, ...nextSources, xml: { ...prev.xml, ...nextSources.xml } }));
    // The browser never hands out an absolute path — webkitRelativePath is
    // relative to the directory the user picked, so its first segment is the
    // only name we have for that directory. That name is what the path field
    // prints; there is nothing truer available to show.
    const root = files.length ? files[0].relPath.split("/")[0] : "";
    setFolderScan({ results, root });
    setFolderBusy(false);
  }, []);

  const handleFolderInputChange = (evt) => {
    const fileList = evt.target.files;
    if (!fileList || fileList.length === 0) return;
    // Read the FileList into a plain array before touching evt.target.value — it's live,
    // and resetting the input's value clears it synchronously, so doing that first (to
    // allow re-picking the same folder later) silently emptied every load.
    const files = Array.from(fileList).map((file) => ({
      relPath: (file.webkitRelativePath || file.name).replace(/\\/g, "/"),
      file,
    }));
    evt.target.value = "";
    scanFolder(files);
  };

  // Persist the paste so a reload does not lose it.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, sources }));
      } catch {
        /* quota or private mode: the editor still works, it just will not persist */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [role, sources]);

  // ---------------------------------------------------------------- parsing

  const parseNow = useCallback(
    (nextRole = role, nextSources = sources) => {
      setBuildError(null);
      try {
        const result = buildProgram({
          cppText: nextSources.cpp,
          xmlText: (nextSources.xml && nextSources.xml[nextRole]) || "",
          headerText: nextSources.header,
          role: nextRole,
        });
        setReport(result.report);
        return result;
      } catch (err) {
        setReport(null);
        setBuildError(String((err && err.message) || err));
        return { ok: false, runtime: null, report: null };
      }
    },
    [role, sources]
  );

  // Re-parse once the folder scan settles, or the role toggle picks a
  // different one of the two already-cached XML trees.
  useEffect(() => {
    const xmlText = (sources.xml && sources.xml[role]) || "";
    if (!sources.cpp.trim() && !xmlText.trim()) {
      setReport(null);
      return undefined;
    }
    const id = window.setTimeout(() => parseNow(role, sources), 500);
    return () => window.clearTimeout(id);
  }, [sources, role, parseNow]);

  // --------------------------------------------------------------- running

  const resetWorld = useCallback(() => {
    const p = placementRef.current;
    worldRef.current = createWorld(
      { robot: { ...p.robot }, ball: { ...p.ball } },
      { ...physicsRef.current, stanceBias: CONFIG_DEFAULTS.stance_bias }
    );
    if (runtimeRef.current) runtimeRef.current.reset(role);
    logCountRef.current = 0;
    if (logRef.current) logRef.current.textContent = "";
    errorRef.current = null;
    overrunRef.current = false;
    telemetryStaleRef.current = false;
    setRuntimeError(null);
    setOverrun(false);
    if (engineRef.current) engineRef.current.resetStats();
  }, [role]);

  const onStep = useCallback(() => {
    const world = worldRef.current;
    const runtime = runtimeRef.current;
    if (!world || !runtime || world.result || runtime.error) return;

    runtime.tick(world);
    world.command = runtime.host.command;
    stepWorld(world, FIXED_DT);
    // A real tick just recomputed telemetry.curve/target from the current
    // placement, so whatever a prior drag invalidated is trustworthy again.
    telemetryStaleRef.current = false;
  }, []);

  const onRender = useCallback(() => {
    const world = worldRef.current;
    const runtime = runtimeRef.current;
    if (!world || !runtime || !rendererRef.current) return;

    rendererRef.current.update(world, runtime.telemetry, {
      hideCurve: telemetryStaleRef.current,
      hideTarget: telemetryStaleRef.current,
      showFov: showFovRef.current,
      showPerceivedBall: showPerceivedRef.current,
    });
    const onDecision = (bucket, text) => {
      const last = lastDecisionRef.current;
      if (last.bucket === bucket && last.text === text) return;
      lastDecisionRef.current = { bucket, text };
      setDecisionState({ bucket, text });
    };
    paintReadout(onDecision, readoutRef.current, detailRef.current, world, runtime, engineRef.current);
    paintNotes(notesRef.current, runtime);
    drainLogs(logRef.current, runtime, logCountRef);

    // Surface a runtime error exactly once rather than on every frame.
    if (runtime.error && errorRef.current !== runtime.error) {
      errorRef.current = runtime.error;
      setRuntimeError(runtime.error);
      if (engineRef.current) engineRef.current.stop();
      setRunning(false);
    }

    // A goal/own-goal/out (physics.js's checkTermination) only ever blocks
    // onStep's own guard — it never stopped the engine itself, so the rAF
    // loop kept running in the background (engine.isRunning() stayed true,
    // Stop stayed the button's label) even though nothing was visibly
    // moving. Dragging the ball back in bounds afterward clears world.result
    // (see the drag effect below, which recomputes it from the ball's own
    // position rather than nulling it blindly) so a repositioned episode can
    // continue — but with the loop still alive underneath, that clear immediately
    // unblocked onStep again on the very next frame, silently resuming real
    // physics stepping (and whatever velocity the ball still had from the
    // kick) the instant you let go of the robot. Stopping the engine here,
    // the moment a result lands, is what actually pauses it — the same
    // treatment runtime.error gets above. engine.isRunning() is its own
    // "already handled" guard: once stopped, this block has nothing left
    // to do on subsequent frames.
    if (world.result && engineRef.current && engineRef.current.isRunning()) {
      engineRef.current.stop();
      setRunning(false);
    }
  }, []);

  const onOverrun = useCallback(() => {
    if (overrunRef.current) return;
    overrunRef.current = true;
    setOverrun(true);
  }, []);

  // Keep onRenderRef pointed at the current onRender — see its declaration next to
  // showFovRef/showPerceivedRef above for why the toggles and the physics-slider
  // effect need it rather than calling onRender directly.
  useEffect(() => {
    onRenderRef.current = onRender;
  }, [onRender]);

  // Build the SVG scene once we are on the simulation step. onStep/onRender/onOverrun
  // all have empty dependency lists, so this effect runs once per step change and the
  // engine is never rebuilt underneath a running simulation.
  useEffect(() => {
    if (step !== "run" || !svgRef.current) return undefined;
    svgRef.current.innerHTML = "";
    rendererRef.current = createRenderer(svgRef.current);

    const engine = createEngine({ onStep, onRender, onOverrun });
    engineRef.current = engine;
    onRender();
    return () => {
      engine.stop();
      engineRef.current = null;
      rendererRef.current = null;
    };
  }, [step, onStep, onRender, onOverrun]);

  // Physics slider changes apply to the live world without restarting the episode.
  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.physics = { ...physics, stanceBias: CONFIG_DEFAULTS.stance_bias };
      // While playing, the rAF loop repaints within the next frame anyway. Paused,
      // nothing else calls onRender — so without this, dragging a slider (the FOV
      // radius one especially, since its cone geometry is physics-derived) would sit
      // stale on screen until Resume or Step. Force one repaint now instead.
      if (engineRef.current && !engineRef.current.isRunning()) onRenderRef.current?.();
    }
  }, [physics]);

  // Stage 1 -> 2: force an immediate re-parse (rather than waiting on the
  // debounce) so the checks the user is about to read reflect exactly what
  // was just loaded, then swap the setup card over to the summary.
  const handleLoadAndCheck = () => {
    parseNow(role, sources);
    setStage("checks");
    // Second and last trigger for the hero shot: the ball finishes its run
    // into the goal as the card swaps over to the checks summary.
    setHeroKick(HERO_KICK_CHECKED);
  };

  // Going back undoes the second trigger: the shot retreats to the halfway
  // mark it held after the entrance, rather than staying parked in the goal
  // while the form it was a payoff for is back on screen.
  const handleEditSetup = () => {
    setStage("setup");
    setHeroKick(HERO_KICK_ENTERED);
  };

  const handleRun = () => {
    const result = parseNow(role, sources);
    if (!result.ok || !result.runtime) return;
    runtimeRef.current = result.runtime;
    // A fresh SimHost defaults usePreciseBall to true — keep the overlay refs
    // in parity so the ball-vision control's own reset-on-remount isn't left
    // pointing at stale true values from a previous run.
    showFovRef.current = false;
    showPerceivedRef.current = false;
    const p = INITIAL_PLACEMENT[role];
    setPlacement(p);
    placementRef.current = p;
    worldRef.current = createWorld(
      { robot: { ...p.robot }, ball: { ...p.ball } },
      { ...physics, stanceBias: CONFIG_DEFAULTS.stance_bias }
    );
    logCountRef.current = 0;
    errorRef.current = null;
    overrunRef.current = false;
    telemetryStaleRef.current = false;
    setRuntimeError(null);
    setOverrun(false);
    setRunning(false);
    // The new world's own trailTracking starts true (physics.js) — keep the
    // button's mirrored state in sync in case a previous run in this same
    // mount had turned it off.
    setTrailTracking(true);
    setStep("run");
  };

  // The run view's own role toggle switches the live simulation, not just a
  // label — the two roles are structurally different behaviour trees, not a
  // reparameterization of one, so this rebuilds the program for the new
  // role's XML (both were already read off disk in one pass at scan time,
  // same as the setup step's instant switch) and restarts the episode at
  // that role's own initial placement. A failed parse leaves the current run
  // untouched rather than tearing down a working simulation for a broken one.
  const handleRoleSwitch = (nextRole) => {
    if (nextRole === role) return;
    const result = parseNow(nextRole, sources);
    if (!result.ok || !result.runtime) return;
    if (engineRef.current) engineRef.current.stop();
    setRunning(false);
    setRole(nextRole);
    runtimeRef.current = result.runtime;
    showFovRef.current = false;
    showPerceivedRef.current = false;
    const p = INITIAL_PLACEMENT[nextRole];
    setPlacement(p);
    placementRef.current = p;
    worldRef.current = createWorld(
      { robot: { ...p.robot }, ball: { ...p.ball } },
      { ...physics, stanceBias: CONFIG_DEFAULTS.stance_bias }
    );
    logCountRef.current = 0;
    errorRef.current = null;
    overrunRef.current = false;
    telemetryStaleRef.current = false;
    setRuntimeError(null);
    setOverrun(false);
    // The new world's own trailTracking starts true (physics.js) — see
    // handleReset's own version of this comment below.
    setTrailTracking(true);
    onRender();
  };

  const togglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.isRunning()) {
      engine.stop();
      setRunning(false);
    } else {
      engine.start();
      setRunning(true);
    }
  };

  const handleReset = () => {
    if (engineRef.current) {
      engineRef.current.stop();
      setRunning(false);
    }
    // resetWorld() seeds the new world from placementRef.current, which
    // normally holds wherever the robot/ball were last dragged to — correct
    // for "restart this exact scenario," but Reset means "back to the
    // start," so it's pointed at the role's own initial placement first
    // (same values handleRun/handleRoleSwitch seed a fresh run with).
    // Setting the ref directly (not just the React state) matters here:
    // resetWorld reads placementRef.current synchronously in this same
    // call, before a setPlacement update would have committed.
    const p = INITIAL_PLACEMENT[role];
    setPlacement(p);
    placementRef.current = p;
    resetWorld();
    // resetWorld() hands worldRef a brand-new world, whose trailTracking
    // starts true (physics.js) — sync the button's own state to match so a
    // reset always resumes recording immediately, same as a fresh run.
    setTrailTracking(true);
    onRender();
  };

  // TestCard's Start button (both the collapsed row's and the expanded
  // description modal's — see TestCard.jsx) calls this with the clicked
  // test definition. Only "Approach & Kick Time" has a real flow behind it
  // today; every other test id is still a placeholder (testDefinitions.js)
  // and this is a no-op for those, same as before this feature existed.
  const handleTestStart = (test) => {
    if (test.id === "approach-kick-time") setTestFlowOpen(true);
  };

  const handleTestCompare = (test) => {
    if (test.id === "approach-kick-time") setCompareFlowOpen(true);
  };

  // Mutates world.trailTracking directly rather than routing through a ref
  // read by the render loop: unlike the old visibility toggle, this has
  // nothing to repaint immediately (a paused sim only draws new points once
  // it steps again), it only has to flip a flag stepWorld checks on its next
  // tick — see the field's own comment in physics.js. Turning tracking back
  // on also opens a fresh segment (world.trail.push([])) right here, at the
  // exact moment "resume" happens — see world.trail's own comment in
  // physics.js for why a new segment, not a continuation of the last one,
  // is what keeps the render from drawing a straight line across whatever
  // ground was covered while paused.
  const onToggleTrail = useCallback(() => {
    setTrailTracking((v) => {
      const next = !v;
      if (worldRef.current) {
        worldRef.current.trailTracking = next;
        if (next) worldRef.current.trail.push([]);
      }
      return next;
    });
  }, []);

  // Clears the recorded points themselves, not just their visibility — the
  // line is gone until tracking (on or later turned on) records fresh ones.
  // Independent of trailTracking on purpose: usable, and immediately
  // visible, whether tracking is currently on or off.
  const onClearTrail = useCallback(() => {
    if (worldRef.current) worldRef.current.trail.length = 0;
    onRender();
  }, [onRender]);

  // ------------------------------------------------------------- dragging

  useEffect(() => {
    if (step !== "run" || !svgRef.current) return undefined;
    const svg = svgRef.current;
    const cleanups = [];

    const clientToField = (evt) => {
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const local = pt.matrixTransform(svg.getScreenCTM().inverse());
      return toField(local.x, local.y);
    };

    let dragging = null;
    const onDown = (evt) => {
      const world = worldRef.current;
      if (!world) return;
      const [fx, fy] = clientToField(evt);
      const dBall = Math.hypot(fx - world.ball.x, fy - world.ball.y);
      const dRobot = Math.hypot(fx - world.robot.x, fy - world.robot.y);
      const hx = world.robot.x + 0.55 * Math.cos(world.robot.theta);
      const hy = world.robot.y + 0.55 * Math.sin(world.robot.theta);
      const dHeading = Math.hypot(fx - hx, fy - hy);

      // Whichever handle the click is proportionally closest to (distance
      // over that handle's own hit radius) wins, rather than a fixed
      // heading/ball/robot priority order — the ball rests right against
      // the robot for most of a real chase-and-kick approach, so a click
      // meant for the robot's body regularly also falls inside the ball's
      // hit radius. With a fixed order testing ball before robot, that
      // click silently grabbed the ball instead — repositioning the robot
      // dragged the ball along with it. Comparing normalized distances
      // means the handle whose hit zone the click is deepest inside is the
      // one that responds, regardless of which check happens to run first.
      // While the engine is running, the robot's position and heading are
      // being written every tick by the behaviour tree itself — a drag
      // grabbing either handle would fight the sim for ownership of them.
      // The ball has no such owner while running, so it stays draggable in
      // both states.
      const candidates = [
        { kind: "heading", ratio: dHeading / 0.28 },
        { kind: "ball", ratio: dBall / 0.3 },
        { kind: "robot", ratio: dRobot / 0.35 },
      ]
        .filter((c) => c.ratio < 1)
        .filter((c) => !runningRef.current || c.kind === "ball");
      if (candidates.length === 0) return;
      candidates.sort((a, b) => a.ratio - b.ratio);
      dragging = candidates[0].kind;

      svg.setPointerCapture(evt.pointerId);
      evt.preventDefault();
    };

    const onMove = (evt) => {
      if (!dragging) return;
      const world = worldRef.current;
      if (!world) return;
      const [fx, fy] = clientToField(evt);
      if (dragging === "ball") {
        world.ball.x = fx;
        world.ball.y = fy;
        world.ball.vx = 0;
        world.ball.vy = 0;
      } else if (dragging === "robot") {
        world.robot.x = fx;
        world.robot.y = fy;
        world.trail.length = 0;
      } else if (dragging === "heading") {
        world.robot.theta = Math.atan2(fy - world.robot.y, fx - world.robot.x);
      }
      // Re-derive world.result from the ball's own new position rather than
      // blindly clearing it: a goal/out leaves the ball resting right where
      // it crossed the line, and dragging the robot back does nothing to
      // move it off that spot. Nulling result unconditionally here used to
      // make Play look dead afterward — the engine would start, checkTermination
      // would immediately see the same out-of-bounds ball on the very first
      // tick, and onRender's own guard would stop it again before anything
      // visibly moved, with a duplicate event silently appended to the log
      // each time. Recomputing means dragging only the robot correctly
      // leaves the episode over (ball still off-field), while dragging the
      // ball back in bounds is what actually lets Play resume.
      world.result = terminalResultFor(world);
      // The robot or ball just moved to a placement runtime.telemetry knows
      // nothing about yet — keep the planned curve/target hidden (onRender,
      // via telemetryStaleRef) until a real tick recomputes them, rather
      // than un-hiding on release only to show the same stale plan again.
      telemetryStaleRef.current = true;
      setPlacement({
        robot: { x: world.robot.x, y: world.robot.y, theta: world.robot.theta },
        ball: { x: world.ball.x, y: world.ball.y },
      });
      onRender();
    };

    const onUp = (evt) => {
      if (!dragging) return;
      dragging = null;
      try {
        svg.releasePointerCapture(evt.pointerId);
      } catch {
        /* pointer already released */
      }
    };

    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    cleanups.push(() => {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
    });
    return () => cleanups.forEach((fn) => fn());
  }, [step, onRender]);

  // ---------------------------------------------------------------- render

  const required = REQUIRED_BY_ROLE[role] || [];
  const canRun =
    !!report &&
    report.missingRequired &&
    report.missingRequired.length === 0 &&
    !report.headerMissing &&
    (!report.unresolvedPorts || report.unresolvedPorts.length === 0);
  const roleMeta = ROLES.find((r) => r.id === role);

  return (
    <>
      {/* This page carries no site nav — the landing/edit step's own headline
          is its only chrome above the setup card, and the run step is a
          full-viewport, edge-to-edge view with no chrome above it either. */}
      <div className="robot-simulator-page">
        {/* Atmospheric hero element — decorative, so it is hidden from
            assistive tech, and it belongs to the landing step only. It sits
            outside the shell because it is anchored to the viewport edge, not
            to the content column. Wrapped in its own fixed, viewport-sized
            clip box rather than clipping on .robot-simulator-page itself —
            see the comment on .rs-hero-clip in RobotSimulator.css for why
            that distinction matters here. */}
        {step === "edit" ? (
          <div className="rs-hero-clip" aria-hidden="true">
            <HeroField kick={heroKick} />
          </div>
        ) : null}

        <div className="rs-shell">
          {step === "edit" ? (
            <header className="rs-hero">
              <h1 className="rs-headline">RoboErectus Simulator</h1>
              <p className="rs-subhead">
                Created by Chun Hoe
                <InfoHint text={INTRO} label="About this simulator" />
              </p>
            </header>
          ) : null}

          {step === "edit" ? (
            <EditorStep
              role={role}
              setRole={(r) => {
                setRole(r);
                setPlacement(INITIAL_PLACEMENT[r]);
              }}
              roles={ROLES}
              roleMeta={roleMeta}
              stage={stage}
              report={report}
              buildError={buildError}
              required={required}
              canRun={canRun}
              onLoadAndCheck={handleLoadAndCheck}
              onEditSetup={handleEditSetup}
              onRun={handleRun}
              selfTest={selfTest}
              onSelfTest={() => setSelfTest(runSelfTest())}
              folderInputRef={folderInputRef}
              folderBusy={folderBusy}
              folderScan={folderScan}
              onFolderInputChange={handleFolderInputChange}
            />
          ) : (
            /* onBack returns to the editor. That tears the engine down through
               the step-keyed effect's cleanup, so the rAF loop cannot outlive
               the view; `running` is cleared alongside it so Play/Stop is not
               left claiming a simulation that no longer exists. */
            <SimStep
              svgRef={svgRef}
              decisionState={decisionState}
              readoutRef={readoutRef}
              detailRef={detailRef}
              notesRef={notesRef}
              logRef={logRef}
              running={running}
              onTogglePlay={togglePlay}
              onReset={handleReset}
              onSpeed={(v) => engineRef.current && engineRef.current.setSpeed(v)}
              trailTracking={trailTracking}
              onToggleTrail={onToggleTrail}
              onClearTrail={onClearTrail}
              physics={physics}
              setPhysics={setPhysics}
              overrun={overrun}
              runtimeError={runtimeError}
              role={role}
              onRoleChange={handleRoleSwitch}
              runtimeRef={runtimeRef}
              onSetShowFov={onSetShowFov}
              onSetShowPerceivedBall={onSetShowPerceivedBall}
              onTestStart={handleTestStart}
              onTestCompare={handleTestCompare}
              testRunning={testRunning}
              onBack={() => {
                if (testRunning) return;
                setRunning(false);
                setStep("edit");
              }}
            />
          )}

          {/* Portaled to <body> via GlassModal (see that component), so its
              position in this tree doesn't matter for layout — rendered here
              rather than inside SimStep because it needs sources/physics
              straight from this component's own state, and because closing
              it over testRunning/setTestRunning is what actually drives the
              navigation lock above and the .rs-back/ViewTabs gating in
              SimStep. */}
          <ApproachKickTestFlow
            isOpen={testFlowOpen}
            onClose={() => setTestFlowOpen(false)}
            sources={sources}
            physics={physics}
            onRunningChange={setTestRunning}
          />
          <CompareResultsFlow
            isOpen={compareFlowOpen}
            onClose={() => setCompareFlowOpen(false)}
          />
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ step 1 */

// Outline-only (stroke, no fill), currentColor, and sized by the caller's
// class — both of these are inline glyphs at the 16px corner-icon step now
// that the source step is a field rather than a button with an anchor icon.
// The closed folder marks the field; the open one marks the action that
// opens it.
function FolderIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6c.4 0 .77.16 1.06.44L11.6 6.8c.28.28.66.44 1.06.44h6.84A1.5 1.5 0 0 1 21 8.75v9.75A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5v-12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderOpenIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 18.5v-12A1.5 1.5 0 0 1 4.5 5h4.6c.4 0 .77.16 1.06.44L11.6 6.8c.28.28.66.44 1.06.44h4.84A1.5 1.5 0 0 1 19 8.75v1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3.2 18.9 5.6 11.7A1.5 1.5 0 0 1 7.02 10.7h13.3a1 1 0 0 1 .95 1.32l-2.1 6.3a1.5 1.5 0 0 1-1.43 1.03H4.63A1.5 1.5 0 0 1 3.2 18.9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditorStep(props) {
  const {
    role, setRole, roles, roleMeta, stage,
    report, buildError, required, canRun, onLoadAndCheck, onEditSetup, onRun,
    selfTest, onSelfTest, folderInputRef, folderBusy, folderScan, onFolderInputChange,
  } = props;

  // Stop index only, not a file count — "Simulation" is stop 3, but it is
  // only ever reached by leaving this step, so 2/3 (READY) is as far as the
  // bar visibly climbs while this page is still on screen.
  const progressValue = stage === "setup" ? 1 : 2;
  const progressHint = stage === "setup" ? "SETUP" : canRun ? "READY" : "CHECKING";

  // The path field's value, and the one status line under it. A directory
  // picked in a browser has no absolute path (see scanFolder), so the value
  // is the picked directory's own name with a trailing slash — enough to say
  // *which* folder is loaded, which is all this readout claims to do.
  const folderPath = folderScan && folderScan.root ? `${folderScan.root}/` : "";
  // No single "expected file" any more — both roles' XML are extracted on
  // scan and every result (cpp, header, both XML trees) is listed below, so
  // this line only has to say whether the scan as a whole came back clean.
  const sourceStatus = folderBusy
    ? { tone: "idle", text: "Scanning folder…" }
    : !folderScan
      ? { tone: "idle", text: "No path loaded" }
      : folderScan.results.every((r) => r.found)
        ? { tone: "success", text: "All files found" }
        : { tone: "error", text: "Some files missing" };
  const reduceMotion = useReducedMotion();
  // Ready is its own key, not just "checks" — the checkmark appearing is
  // itself a small transition worth crossfading, not just the setup/checks
  // switch.
  const stageBtnKey = stage === "checks" && canRun ? "ready" : stage;

  return (
    /* The width constraint lives on the wrapper, the column layout on the
       child — the right ~42% of the hero area belongs to the image. */
    <div className="rs-editor-layout">
      <div className="rs-init-col">
        <ProgressBar
          surface
          ballTip
          value={progressValue}
          max={PROGRESS_STOPS.length}
          label="Progress"
          hint={progressHint}
        />

        {/* Role and source used to be two stacked panels ("Step 1 · Role",
            "Step 2 · Source"); merged into one card that also takes over the
            checks summary once the user has moved past setup, so the page
            never shows the setup form and the results at the same time. It
            stays pinned (position: sticky) while the page scrolls past it —
            see .rs-setup-card and .rs-hero-clip in RobotSimulator.css for
            why the hero's clip had to move off .robot-simulator-page for
            that to work at all. */}
        <section className="rs-panel rs-setup-card">
          {stage === "setup" ? (
            <>
              <RoleToggle
                legend="Step 1 · Role"
                options={roles.map((r) => ({ id: r.id, label: r.label }))}
                value={role}
                onChange={setRole}
              />
              <span className="rs-panel-label">Step 2 · Source Directory</span>
              <div className="rs-source-body">
                {/* Local folder is the only source method now, so this is not
                    a floating "choose…" button any more — it is a path field
                    with its Browse control joined to its right edge, the way
                    a desktop tool states a directory setting: the value is
                    the primary thing on the row, and the button that changes
                    it is attached to it rather than standing on its own. The
                    field is genuinely read-only — the browser's directory
                    picker is the only way to hand a folder to a page, so a
                    typed path could never be honoured. */}
                {/* The field and its meta line are one unit and sit tighter
                    together than .rs-source-body's own rhythm allows, so
                    they get their own gap here rather than a margin on the
                    meta line. */}
                <div className="rs-source-input">
                  <div
                    className={`rs-path-group${
                      sourceStatus.tone === "success" ? " is-valid" : ""
                    }`}
                  >
                    <div className="rs-path-field">
                      <FolderIcon className="rs-field-icon" />
                      <span
                        className={`rs-path-value${folderScan ? "" : " is-placeholder"}`}
                        title={folderPath || undefined}
                      >
                        {folderPath || "No folder selected…"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rs-browse-btn"
                      disabled={folderBusy}
                      onClick={() => folderInputRef.current && folderInputRef.current.click()}
                    >
                      <FolderOpenIcon className="rs-field-icon" />
                      {folderBusy ? "Scanning…" : "Browse…"}
                    </button>
                    <input
                      ref={folderInputRef}
                      type="file"
                      webkitdirectory=""
                      directory=""
                      multiple
                      hidden
                      onChange={onFolderInputChange}
                    />
                  </div>

                  {/* No named "expected file" any more — the list below
                      names every file itself, both roles' XML included — so
                      this line is just the roll-up: clean scan or not.
                      aria-live, because it is the only announcement a scan
                      produces. */}
                  <p className={`rs-source-meta rs-meta-status is-${sourceStatus.tone}`} aria-live="polite">
                    <span className="rs-status-dot" aria-hidden="true" />
                    {sourceStatus.text}
                  </p>
                </div>

                {folderScan ? (
                  <ul className="rs-file-list">
                    {/* Both roles' XML are extracted on scan (see
                        scanFolder), and both are listed here — not just the
                        one the role toggle currently points at — so loading
                        a folder once shows everything it found. */}
                    {folderScan.results.map((r) => (
                      <li
                        key={r.roleId ? `${r.tabId}-${r.roleId}` : r.tabId}
                        className="rs-file-row"
                      >
                        <code className="rs-mono rs-file-path">{r.path}</code>
                        <StatusIndicator
                          tone={r.found ? "success" : "error"}
                          label={r.found ? "Found" : "Missing"}
                          animateKey={`${r.tabId}-${r.roleId || ""}-${r.found}`}
                        />
                        {!r.found ? (
                          <span className="rs-file-note">
                            {r.error
                              ? `Could not read it — ${r.error}`
                              : "Not found in the selected folder."}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : (
            <div className="rs-checks-summary">
              <div className="rs-checks-header">
                <span className="rs-panel-label">Checks</span>
                <button
                  type="button"
                  className="btn btn-secondary rs-checks-back-btn"
                  onClick={onEditSetup}
                >
                  Back
                </button>
              </div>
              {buildError ? (
                <Notice tone="error" title="Build failed" glyph={false}>
                  {buildError}
                </Notice>
              ) : null}
              {!report ? (
                <p className="rs-hint">
                  Load <code className="rs-mono">brain_tree.cpp</code> and a behaviour-tree XML
                  to see what was extracted.
                </p>
              ) : (
                <DiagnosticsSummary report={report} required={required} />
              )}
            </div>
          )}
        </section>

        <section className="rs-run-section">
          <div className="rs-run-row">
            {/* One button, its label naming the verb for whichever stage the
                page is in — Load & Check runs the first validation pass,
                Start Simulation only appears once checks have passed. The
                width change between the two labels (and the checkmark that
                appears once checks pass) animates via framer-motion's
                `layout` rather than a hardcoded width — see CLAUDE.md ->
                Motion -> Spring-based controls. */}
            <motion.button
              layout
              type="button"
              className="btn btn-primary rs-stage-btn"
              disabled={stage === "setup" ? !folderScan || folderBusy : !canRun}
              onClick={stage === "setup" ? onLoadAndCheck : onRun}
              transition={reduceMotion ? { duration: 0 } : SPRING_UI}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={stageBtnKey}
                  className="rs-stage-btn-label"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {stageBtnKey === "ready" ? (
                    <CircleCheck className="rs-stage-btn-icon" aria-hidden="true" />
                  ) : null}
                  {stage === "setup" ? "Load & Check" : "Start Simulation"}
                </motion.span>
              </AnimatePresence>
            </motion.button>
            <button type="button" className="btn btn-secondary" onClick={onSelfTest}>
              Interpreter self-check
            </button>
            <InfoHint text={CONFIG_NOTE} label="About config.yaml values" align="end" />
          </div>

          {selfTest ? (
            <p className={`rs-selftest rs-selftest-${selfTest.failed === 0 ? "ok" : "bad"}`}>
              <StatusIndicator
                tone={selfTest.failed === 0 ? "success" : "error"}
                label={`${selfTest.passed} passed, ${selfTest.failed} failed`}
                animateKey={`${selfTest.passed}-${selfTest.failed}`}
              />
              {selfTest.failed > 0 ? (
                <span className="rs-selftest-detail">
                  {selfTest.results
                    .filter((r) => !r.ok)
                    .map((r) => `${r.name} — ${r.detail}`)
                    .join("; ")}
                </span>
              ) : null}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/**
 * The collapsed view: the three things worth knowing at a glance — did the
 * required functions parse, is anything critically broken, and how many ports
 * were read without being declared. Status is color only, per CLAUDE.md.
 *
 * Everything else lives behind the disclosure, which is closed on load and
 * expands inline, pushing the page down rather than overlaying it.
 */
function DiagnosticsSummary({ report, required }) {
  const missing = report.missingRequired.length;
  const undeclared = report.undeclaredPorts ? report.undeclaredPorts.length : 0;
  const unresolvedPorts = report.unresolvedPorts ? report.unresolvedPorts.length : 0;

  return (
    <>
      <div className="rs-diag-strip">
        <StatusIndicator
          glyph={false}
          tone={missing === 0 ? "success" : "error"}
          label={
            missing === 0
              ? `All ${required.length} required functions parsed`
              : `${missing} of ${required.length} required functions not parsed`
          }
        />

        {report.xmlError ? (
          <StatusIndicator glyph={false} tone="error" label={`Behaviour XML: ${report.xmlError}`} />
        ) : null}

        {report.headerMissing ? (
          <StatusIndicator glyph={false} tone="error" label="Header missing — cannot run" />
        ) : null}

        {unresolvedPorts > 0 ? (
          <StatusIndicator
            glyph={false}
            tone="error"
            label={`${unresolvedPorts} port${unresolvedPorts === 1 ? "" : "s"} declared but unresolved`}
          />
        ) : null}

        {undeclared > 0 ? (
          <StatusIndicator
            glyph={false}
            tone="muted"
            label={`${undeclared} port${undeclared === 1 ? " is" : "s are"} read but not declared — not a problem`}
          />
        ) : null}
      </div>

      <details className="rs-diag-details">
        <summary>
          View full diagnostics
          <svg
            className="rs-diag-chevron"
            viewBox="0 0 12 12"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2.5 4.5L6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>
        <div className="rs-diag-full">
          <Diagnostics report={report} />
        </div>
      </details>
    </>
  );
}

/**
 * The expanded detail, revealed by the disclosure in DiagnosticsSummary. It
 * deliberately omits the headline statuses the collapsed strip already shows
 * — the strip stays visible while this is open, and repeating those lines
 * directly beneath themselves read as a bug.
 *
 * Every status here is glyphless: the label's color is the status. A column
 * of repeated ticks and dots was noise, so `glyph={false}` is passed
 * throughout (see the status rule in CLAUDE.md).
 */
export function Diagnostics({ report }) {
  const byStatus = { parsed: [], failed: [], missing: [] };
  for (const f of report.functions) byStatus[f.status].push(f);

  return (
    <>
      {report.stats ? (
        <p className="rs-hint">
          Scanned {report.stats.totalLines.toLocaleString()} lines; extracted{" "}
          {report.stats.extractedLines.toLocaleString()} ({report.stats.percent.toFixed(1)}%).
        </p>
      ) : null}

      <div className="rs-diag-group">
        {report.missingRequired.length > 0 ? (
          <Notice tone="error" title="Required functions not parsed" glyph={false}>
            <ul>
              {report.missingRequired.map((n) => (
                <li key={n}>
                  <code className="rs-mono">{n}</code>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {report.headerMissing ? (
          <Notice tone="error" title="Header missing — cannot run" glyph={false}>
            <p>
              Load <code className="rs-mono">include/brain_tree.h</code>. The XML sets only a
              handful of ports; the rest come from each node&rsquo;s{" "}
              <code className="rs-mono">providedPorts()</code> defaults. Without it those
              ports resolve to 0, which changes what the code does rather than degrading
              gracefully.
            </p>
            <p>
              <code className="rs-mono">Adjust.session_timeout_ms</code> is the sharp case:
              the real default is 4000&nbsp;ms, and at 0 the watchdog trips on the first
              tick, so Adjust never runs and the robot never lines up a kick.
            </p>
          </Notice>
        ) : null}

        {report.unresolvedPorts && report.unresolvedPorts.length > 0 ? (
          <Notice tone="error" title="Ports declared but unresolved" glyph={false}>
            <ul>
              {report.unresolvedPorts.map((n) => (
                <li key={n}>
                  <code className="rs-mono">{n}</code>
                </li>
              ))}
            </ul>
          </Notice>
        ) : null}

        {report.xmlError ? (
          <Notice tone="error" title="Behaviour XML" glyph={false}>
            {report.xmlError}
          </Notice>
        ) : report.xmlNodes.length ? (
          <StatusIndicator
            tone="success"
            glyph={false}
            label={`Behaviour XML: ports from ${report.xmlNodes.length} tags`}
          />
        ) : null}
      </div>

      {report.undeclaredPorts && report.undeclaredPorts.length > 0 ? (
        <div className="rs-diag-section">
          <span className="rs-subhead-label">Ports read but not declared</span>
          <p className="rs-hint">
            The code calls <code className="rs-mono">getInput()</code> for these, but no{" "}
            <code className="rs-mono">providedPorts()</code> entry declares them, so the real
            robot cannot resolve them either and ignores the failed read. Most sit behind a
            guard that is false for this role.
          </p>
          <p className="rs-symbols">{report.undeclaredPorts.join(", ")}</p>
        </div>
      ) : null}

      <div className="rs-diag-section">
        <span className="rs-subhead-label">Functions</span>
        <ul className="rs-fn-list">
          {byStatus.parsed.map((f) => (
            <li key={f.name} className="rs-fn">
              <StatusIndicator tone="success" glyph={false} label={f.name} />
              <span className="rs-fn-detail">
                {f.lines} lines
                {f.role === "dependency" ? " · pulled in as a dependency" : ""}
              </span>
            </li>
          ))}
          {byStatus.failed.map((f) => (
            <li key={f.name} className="rs-fn">
              <StatusIndicator tone="error" glyph={false} label={f.name} />
              <span className="rs-fn-detail">
                failed at line {f.line}:{f.col} — {f.detail}
              </span>
            </li>
          ))}
          {byStatus.missing.map((f) => (
            <li key={f.name} className="rs-fn">
              <StatusIndicator tone="muted" glyph={false} label={f.name} />
              <span className="rs-fn-detail">not found</span>
            </li>
          ))}
        </ul>
      </div>

      {report.unresolved && report.unresolved.length ? (
        <div className="rs-diag-section">
          <span className="rs-subhead-label">Unresolved calls</span>
          <p className="rs-hint">
            Neither a host built-in nor defined in the source. Reaching one during a run
            stops the tick.
          </p>
          <p className="rs-symbols">{report.unresolved.join(", ")}</p>
        </div>
      ) : null}

      {report.fileScopeVars && report.fileScopeVars.length ? (
        <div className="rs-diag-section">
          <span className="rs-subhead-label">File-scope variables</span>
          <p className="rs-symbols">{report.fileScopeVars.join(", ")}</p>
        </div>
      ) : null}

      {report.headerClasses && report.headerClasses.length ? (
        <div className="rs-diag-section">
          <span className="rs-subhead-label">Header</span>
          <p className="rs-hint">
            Read defaults and member initial values from {report.headerClasses.length}{" "}
            classes.
            {report.portSources ? (
              <>
                {" "}
                {Object.values(report.portSources).filter((s) => s === "xml").length} port
                values came from the XML,{" "}
                {Object.values(report.portSources).filter((s) => s === "header").length} from
                the header.
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ step 2 */

const SPEED_SEGMENTS = [
  { id: "0.5", label: "0.5×" },
  { id: "1", label: "1×" },
  { id: "2", label: "2×" },
];

// The console's own view switch, below the playback cluster. "single" is the
// only one with real content right now — see the placeholder swap around
// .rs-run-console below.
const CONSOLE_VIEWS = [
  { id: "single", label: "Single Robot" },
  { id: "multi", label: "Multi Robot" },
  { id: "reports", label: "Testing" },
];

// 16px grid, 1.3 stroke — the button carries the accessible name, this is
// decoration only.
function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M9.5 3.5L5 8l4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Trail toggle, off state — a ring standing in for a tracked point/pin, the
// same convention the rest of this file's icons follow (stroke-only,
// currentColor).
function TrailIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

// Trail toggle, on state — a pause glyph rather than a stop square:
// clicking again suspends recording without discarding it, and resuming
// continues the same line rather than starting over, so "pause" is the
// accurate reading, not "stop". Deliberately distinct from TrailClearIcon's
// square below, since the two buttons sit right next to each other and
// would otherwise share a glyph for two very different actions.
function TrailPauseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <line x1="6" y1="4" x2="6" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="10" y1="4" x2="10" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Clear trail — a square, standing in for the classic transport "stop"
// glyph repurposed here for a momentary clear rather than a toggle state.
function TrailClearIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect
        x="4.25"
        y="4.25"
        width="7.5"
        height="7.5"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}

/* The same liquid-glass wobble as GlassButton's shared filter (see
   src/components/GlassButton.jsx and CLAUDE.md -> Surfaces -> Exception 4),
   on .rs-legend's expanded key -- a second, distinctly-tuned use of the
   technique, not a reference to the shared one: .rs-legend expands from a
   44px circle to a wide bar, closer to the full-panel surface this effect
   was originally tuned down from, so it gets a lower baseFrequency
   (larger-scale wobble that doesn't look like noise stretched thin across a
   wide box) and a slightly larger displacement scale. Only active while the
   key is expanded -- see .rs-legend:hover/:focus-visible in
   RobotSimulator.css -- collapsed it stays the plain --glass-hud frost like
   any other corner icon. */
function LegendGlassFilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="rs-glass-filter-defs">
      <filter id="rs-legend-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.025" numOctaves="2" seed="5" result="turbulence" />
        <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
        <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="22" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}

/* A third, named use of the same liquid-glass wobble (see CLAUDE.md ->
   Surfaces -> Exception 4), on the physics drawer -- .rs-back's whole
   material (--glass-fill-droplet-panel, --blur-hud, this turbulence
   displacement, --shadow-glass-rim-panel in place of a hairline), not just
   its fill color, so the drawer reads as the same droplet of glass rather
   than a coincidentally-similar tint. Its own filter rather than a shared
   one: the drawer is a large, roughly panel-sized surface carrying real
   content (slider labels, values) rather than a small icon or a thin bar,
   so it gets the lowest baseFrequency of the three -- a broad, slow wobble
   that reads as glass across a big area instead of noise. Always on while
   the drawer is visible; unlike .rs-legend there's no collapsed state to
   leave it off for. */
function DrawerGlassFilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="rs-glass-filter-defs">
      <filter id="rs-drawer-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.018" numOctaves="2" seed="11" result="turbulence" />
        <feGaussianBlur in="turbulence" stdDeviation="2.5" result="blurredNoise" />
        <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="20" xChannelSelector="R" yChannelSelector="B" />
      </filter>
    </svg>
  );
}

/* Same 16px grid and 1.3 stroke as BackIcon — a stack of two layers, read as
   "key/legend" rather than "info", since this is a fixed set of categorical
   tags rather than explanatory prose (that's InfoHint's job). */
function LegendIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 2.5L14 5.75L8 9L2 5.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 8.5L8 11.5L13.5 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="rs-diag-chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M2.5 4.5L6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Physical interaction constant, not a spacing value — how much the page has
// to scroll before the physics drawer is fully open. Same carve-out category
// as this file's other untokenized container dimensions.
const DRAWER_REVEAL_PX = 240;
// The same threshold .rs-physics-drawer.is-hidden already used inline,
// named so the one-time pop entrance (below) can trigger off exactly the
// same crossing rather than a second, possibly-drifting magic number.
const DRAWER_REVEAL_THRESHOLD = 0.01;

// Physical interaction constants for the HUD's magnetic-droplet controls —
// same carve-out as DRAWER_REVEAL_PX above, since these describe pointer
// geometry rather than layout spacing. REACH extends a control's pull
// detection zone beyond its own box, so it starts leaning toward the cursor
// before the pointer is literally over it. PULL caps how far it may drift
// so the lean reads as elastic, not unbounded, and STRENGTH is how quickly
// that drift ramps up with distance from center.
const BACK_BUTTON_REACH_PX = 25;
const BACK_BUTTON_PULL_PX = 5;
const BACK_BUTTON_PULL_STRENGTH = 0.12;
const BACK_BUTTON_HOVER_SCALE = 1.12;
const BACK_BUTTON_TAP_SCALE = 1.24;

// The legend gets the same magnetic pull, deliberately weaker: it sits next
// to the back button but expands into a wide bar rather than staying a
// fixed 44px circle, so a strong pull would drag a much larger surface
// around and read as loose rather than elastic. Its click bounce is subtler
// for the same reason — a 1.24x pop that reads as tactile on a small icon
// would read as a lurch across a fully expanded key.
const LEGEND_REACH_PX = 24;
const LEGEND_PULL_PX = 6;
const LEGEND_PULL_STRENGTH = 0.18;
const LEGEND_TAP_SCALE = 1.05;

// Geometry for the "Limit Ball Vision" split/recombine (see SPRING_SPLIT in
// motionSpring.js) — plain numbers rather than read CSS custom properties,
// the same carve-out category as DRAWER_REVEAL_PX above. Each of the three
// circles is the same 44px tap-target family as .rs-trail-toggle-btn, spaced
// by --space-3 (12px); BALL_VISION_CENTERS_PX is each circle's own centre-x
// within the cluster, left to right (fov, perceived, cancel), which the split
// animation needs to compute how far each circle travels from the pill's own
// measured centre (see pillCenterPxRef in SimStep).
const BALL_VISION_CIRCLE_PX = 44; // matches --tap-target-min
const BALL_VISION_GAP_PX = 12; // matches --space-3
const BALL_VISION_CENTERS_PX = [0, 1, 2].map(
  (i) => i * (BALL_VISION_CIRCLE_PX + BALL_VISION_GAP_PX) + BALL_VISION_CIRCLE_PX / 2
); // [22, 78, 134]

function SimStep(props) {
  const {
    svgRef, decisionState, readoutRef, detailRef, notesRef, logRef, running, onTogglePlay, onReset, onSpeed,
    trailTracking, onToggleTrail, onClearTrail,
    physics, setPhysics, overrun, runtimeError, role, onRoleChange, onBack,
    runtimeRef, onSetShowFov, onSetShowPerceivedBall,
    onTestStart, testRunning, onTestCompare,
  } = props;

  const [speedId, setSpeedId] = useState("1");
  const [consoleView, setConsoleView] = useState("single");
  const [statsFace, setStatsFace] = useState("telemetry");
  const [logAlertOpen, setLogAlertOpen] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  const logCopiedTimeoutRef = useRef(null);
  const drawerRef = useRef(null);
  const reduceMotion = useReducedMotion();

  // "Limit Ball Vision" cluster — local state so leaving and re-entering
  // the run step (which unmounts/remounts SimStep) resets it for free.
  // usePreciseBall itself lives on the SimHost instance (runtimeRef), mutated
  // directly on click the same way the drag handler elsewhere in this file
  // mutates worldRef.current.robot — a plain, synchronous ref write. The
  // robot starts with precise, ground-truth ball tracking; pressing the pill
  // is what switches it onto the realistic FOV/range/confidence/jitter model,
  // and cancel (X) reverts back to precise.
  const [ballVisionExpanded, setBallVisionExpanded] = useState(false);
  const [showFov, setShowFov] = useState(false);
  const [showPerceivedBall, setShowPerceivedBall] = useState(false);

  // The pill's own measured centre-x, in local coordinates shared with the
  // three-circle cluster it splits into/recombines from (both are rendered at
  // the same left edge of .rs-decision-row — see the AnimatePresence below).
  // Measured once via useLayoutEffect rather than on click: "Limit Ball
  // Vision" is static text, so its rendered width never changes, and the
  // split/recombine's own initial/exit values need this before the very
  // first click can fire. pillRef sits on the wrapping motion.div rather than
  // the GlassButton itself (GlassButton forwards no DOM ref) — a flex item
  // with no explicit width still shrinks to its content, so the div's
  // measured width matches the button's. Falls back to the cluster's own
  // centre (its middle circle) if measured before layout for any reason.
  const pillRef = useRef(null);
  const pillCenterPxRef = useRef(BALL_VISION_CENTERS_PX[1]);
  useLayoutEffect(() => {
    if (pillRef.current) pillCenterPxRef.current = pillRef.current.offsetWidth / 2;
  }, []);

  const collapseBallVision = useCallback(() => {
    if (runtimeRef.current) runtimeRef.current.host.usePreciseBall = true;
    setShowFov(false);
    setShowPerceivedBall(false);
    onSetShowFov(false);
    onSetShowPerceivedBall(false);
    setBallVisionExpanded(false);
  }, [runtimeRef, onSetShowFov, onSetShowPerceivedBall]);

  // A role switch rebuilds a brand-new SimHost (usePreciseBall defaults to
  // true again) without unmounting SimStep itself, so without this the
  // cluster's own UI could keep showing "expanded"/toggled-on against a host
  // that silently reverted underneath it.
  useEffect(() => {
    collapseBallVision();
  }, [role, collapseBallVision]);

  // Copies the log stream's current text on click and shows "Copied!" for
  // 3s. logRef's own textContent is written imperatively by drainLogs on
  // every frame (see the comment on .rs-log-stream-wrap below), so reading
  // it fresh here rather than from React state is the only way to get
  // what's actually on screen at click time. The previous timeout is
  // cleared on every click so a rapid second click restarts the full 3s
  // rather than the badge fading mid-read.
  const onCopyLog = () => {
    const text = logRef.current ? logRef.current.textContent : "";
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setLogCopied(true);
      if (logCopiedTimeoutRef.current) window.clearTimeout(logCopiedTimeoutRef.current);
      logCopiedTimeoutRef.current = window.setTimeout(() => setLogCopied(false), 3000);
    });
  };
  useEffect(() => {
    return () => {
      if (logCopiedTimeoutRef.current) window.clearTimeout(logCopiedTimeoutRef.current);
    };
  }, []);

  // The legend's own magnetic-droplet pull. A motion value, not React state
  // — a mousemove-driven setState would re-render SimStep on every frame of
  // a pointer sweep, the same reasoning RoleToggle's cursor highlight
  // documents for writing straight to custom properties instead. useSpring
  // wraps the raw value so the control eases toward wherever the pointer
  // last put it rather than tracking it frame-exact. The back button, Play,
  // Reset and the speed options get the identical treatment through
  // GlassButton (src/components/GlassButton.jsx) instead, which manages its
  // own listener per instance — see that file's own comment for why this
  // one console-wide listener isn't extended to cover them too.
  const legendRef = useRef(null);
  const legendPullX = useMotionValue(0);
  const legendPullY = useMotionValue(0);
  const legendSpringX = useSpring(legendPullX, SPRING_MAGNETIC);
  const legendSpringY = useSpring(legendPullY, SPRING_MAGNETIC);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const handleMove = (evt) => {
      applyMagneticPull(
        legendRef.current, evt,
        LEGEND_REACH_PX, LEGEND_PULL_PX, LEGEND_PULL_STRENGTH,
        legendPullX, legendPullY
      );
    };
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [reduceMotion, legendPullX, legendPullY]);

  // Closes itself once there is nothing left to report, so it never lingers
  // open on stale content after a Reset clears the error.
  useEffect(() => {
    if (!runtimeError && !overrun) setLogAlertOpen(false);
  }, [runtimeError, overrun]);

  // Entering this step has to start from the top of the page. The drawer's
  // reveal is scroll-driven from zero, but the editor step this replaces is
  // tall — hero, three panels, the diagnostics strip — so the user has very
  // likely scrolled some way down it before pressing Run, and React does not
  // reset scroll on a state change the way a route change would. Without
  // this the scrub initialises `shown` from a stale window.scrollY that is
  // already past DRAWER_REVEAL_PX and the drawer is fully open on the first
  // paint. Declared BEFORE useScrollScrub on purpose: effects fire in hook
  // order, so scrollY is already 0 by the time the scrub reads it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // rs-run-layout is position: fixed (see RobotSimulator.css), so it never
  // moves regardless of scroll — plain window.scrollY is all the drawer
  // needs, same as it would for any other fixed element.
  const getDrawerTarget = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
    return Math.min(1, Math.max(0, window.scrollY / DRAWER_REVEAL_PX));
  };
  const onDrawerFrame = (progress) => {
    const el = drawerRef.current;
    if (!el) return;
    el.style.setProperty("--rs-drawer", progress.toFixed(4));
    // The slide (see .rs-physics-drawer in RobotSimulator.css) already moves
    // the drawer below rs-field-panel's clipped bounds at rest, but a
    // transform alone doesn't drop it from the accessibility tree or stop it
    // catching a stray pointer event — is-hidden does both explicitly.
    el.classList.toggle("is-hidden", progress < DRAWER_REVEAL_THRESHOLD);
  };
  useScrollScrub(drawerRef, getDrawerTarget, onDrawerFrame);

  return (
    <>
      <div className="rs-run-layout">
        {/* This IS the field surface — turf background, filling the whole
            viewport, with every piece of chrome positioned against it. There
            is no separate wrap div: the previous field-wrap/field-panel split
            was two boxes that could (and did) disagree on width; one box
            that's both the sizing root and the visual surface can't. */}
        <section className="rs-field-panel">
          <svg ref={svgRef} id="field" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} />

          {/* Rendered once — every GlassButton on this step (this back
              button, and Play/Reset/the speed options in the console below)
              references the same filter by id, so it only needs to exist
              once in the document. */}
          <GlassButtonFilter />

          {/* The only in-page way back to the editor — this step has no
              header and no site nav, so without it the sole route back is
              browser-back. Lives inside the field panel rather than the run
              layout so it stays anchored to the field in the stacked
              sub-900px layout too, where the layout itself is static. Built
              on GlassButton (see CLAUDE.md -> Components -> Glass button)
              with this control's own tuned reach/pull/scale — the exact
              values this button used before the extraction — rather than
              GlassButton's weaker pill-shape defaults, since a 44px circle
              takes a stronger pull before it reads as loose. */}
          <GlassButton
            variant="glass"
            className="rs-back"
            onClick={onBack}
            disabled={testRunning}
            aria-label="Back to editor"
            reach={BACK_BUTTON_REACH_PX}
            pull={BACK_BUTTON_PULL_PX}
            strength={BACK_BUTTON_PULL_STRENGTH}
            hoverScale={BACK_BUTTON_HOVER_SCALE}
            tapScale={BACK_BUTTON_TAP_SCALE}
          >
            <BackIcon />
          </GlassButton>

          {/* Corner brackets framing the pitch — the instrument cue, and
              purely decorative, so it is hidden from assistive tech and
              never intercepts a drag meant for the ball. Brackets rather
              than a grid: the pitch already carries its own markings and a
              grid would compete with them. */}
          <div className="rs-reticle" aria-hidden="true">
            <span className="rs-reticle-corner rs-reticle-corner--tl" />
            <span className="rs-reticle-corner rs-reticle-corner--tr" />
            <span className="rs-reticle-corner rs-reticle-corner--bl" />
            <span className="rs-reticle-corner rs-reticle-corner--br" />
          </div>

          {/* Overlaid on the field rather than occupying its own row below —
              a hard-edged, full-height field has no spare row left for it,
              and top-left keeps it clear of the physics drawer's bottom 40%.
              Collapsed to the icon alone at rest so it costs the field almost
              nothing; hover or keyboard focus (the div is tabbable) expands
              it to the full key. The container's own aria-label carries the
              full set of tags regardless of hover state, so the tags
              themselves are aria-hidden — they're kept mounted only for the
              opacity/transform reveal, not as a second route to the same
              information. */}
          <LegendGlassFilter />
          <motion.div
            ref={legendRef}
            className="rs-legend rs-hud"
            tabIndex={0}
            aria-label="Decision legend: chase, adjust, kick, find, not simulated"
            style={reduceMotion ? undefined : { x: legendSpringX, y: legendSpringY }}
            whileTap={
              reduceMotion
                ? { scale: 1.02, transition: { duration: 0 } }
                : { scale: LEGEND_TAP_SCALE, transition: SPRING_CLICK }
            }
          >
            <span className="rs-legend-icon" aria-hidden="true">
              <LegendIcon />
            </span>
            <div className="rs-legend-content" aria-hidden="true">
              <span><i className="rs-legend-swatch rs-legend-swatch--chase" /> chase</span>
              <span><i className="rs-legend-swatch rs-legend-swatch--adjust" /> adjust</span>
              <span><i className="rs-legend-swatch rs-legend-swatch--kick" /> kick</span>
              <span><i className="rs-legend-swatch rs-legend-swatch--find" /> find</span>
              <span><i className="rs-legend-swatch rs-legend-swatch--idle" /> not simulated</span>
            </div>
          </motion.div>

          {/* is-hidden from the first paint, not just from the first scrub
              frame — the class is what makes it inert while closed. No
              rs-glass here: this gets .rs-back's own material (droplet
              fill, turbulence filter, rim) rather than the plain nested-
              panel glass every other rs-glass surface uses — see the
              .rs-physics-drawer rule in RobotSimulator.css and
              DrawerGlassFilter above. */}
          <DrawerGlassFilter />
          <div ref={drawerRef} className="rs-physics-drawer is-hidden">
            <div className="rs-physics-drawer-header">
              <span className="rs-physics-drawer-label">Physics</span>
              <button
                type="button"
                className="rs-drawer-reset"
                onClick={() => setPhysics({ ...DEFAULT_PHYSICS, stanceBias: CONFIG_DEFAULTS.stance_bias })}
                aria-label="Reset physics to defaults"
              >
                <RefreshCw aria-hidden="true" />
              </button>
            </div>
            <div className="rs-slider-grid">
              {SLIDERS.map((s) => (
                <label key={s.key} className="rs-slider">
                  <span className="rs-slider-label">
                    {s.label}
                    <em>
                      {Number(physics[s.key]).toFixed(s.step < 0.05 ? 2 : s.step < 1 ? 2 : 1)}
                      {s.unit}
                    </em>
                  </span>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={physics[s.key]}
                    onChange={(e) => setPhysics({ ...physics, [s.key]: Number(e.target.value) })}
                  />
                  <span className="rs-slider-note">{s.note}</span>
                </label>
              ))}
            </div>
            <label className="rs-slider">
              <span className="rs-slider-label">
                RNG seed<em>{physics.seed}</em>
              </span>
              <input
                type="number"
                value={physics.seed}
                onChange={(e) => setPhysics({ ...physics, seed: Number(e.target.value) || 1 })}
              />
              <span className="rs-slider-note">
                Same seed, same scatter — reset to re-run a scenario identically.
              </span>
            </label>
          </div>
        </section>

        {/* Play, Reset and the speed options used to live inside the console
            card below, sharing its padding with the telemetry. Pulled out
            into their own floating cluster so they read as standalone
            controls sitting on the field, not as rows in the same panel as
            the readout — see CLAUDE.md -> Components -> Glass button. Both
            children are positioned exactly where .rs-run-console used to
            size itself (top/right/bottom/width), so the console keeps its
            own footprint and this is purely a visual/structural split, not
            a repositioning. */}
        <div className="rs-console-col">
          <div className="rs-playback-cluster">
            <div className="rs-playback-primary">
              {/* Always the opaque accent fill, whether the label reads
                  "Play" or "Stop" — the one dominant action in the cluster,
                  never the toggling primary/secondary swap this used to be.
                  See CLAUDE.md -> Components -> Glass button. */}
              <GlassButton variant="accent" className="rs-play-btn" onClick={onTogglePlay}>
                {running ? "⏸ Stop" : "▶ Play"}
              </GlassButton>
              <GlassButton variant="glass" className="rs-reset-btn" onClick={onReset}>
                ⟲ Reset
              </GlassButton>

              {/* Small circular icon buttons — same 44px-circle shape class
                  as .rs-back, so they reuse its exact tuning rather than
                  GlassButton's wider-pill defaults (CLAUDE.md -> Motion ->
                  Spring-based controls: tune per shape, not per instance).
                  Trail is a toggle (selected = accent glass, per the same
                  "selected" reading a segmented control's active segment
                  gets, plus an icon swap to name the action a click will
                  take next — ring "start" / bars "pause") that starts or
                  pauses recording new points without touching the ones
                  already drawn; Clear is a momentary action that empties
                  them and never carries selected. */}
              <GlassButton
                variant="glass"
                className="rs-trail-toggle-btn"
                selected={trailTracking}
                onClick={onToggleTrail}
                aria-pressed={trailTracking}
                aria-label={trailTracking ? "Pause trail tracking" : "Start trail tracking"}
                reach={BACK_BUTTON_REACH_PX}
                pull={BACK_BUTTON_PULL_PX}
                strength={BACK_BUTTON_PULL_STRENGTH}
                hoverScale={BACK_BUTTON_HOVER_SCALE}
                tapScale={BACK_BUTTON_TAP_SCALE}
              >
                {trailTracking ? <TrailPauseIcon /> : <TrailIcon />}
              </GlassButton>
              <GlassButton
                variant="glass"
                className="rs-trail-clear-btn"
                onClick={onClearTrail}
                aria-label="Clear trail"
                reach={BACK_BUTTON_REACH_PX}
                pull={BACK_BUTTON_PULL_PX}
                strength={BACK_BUTTON_PULL_STRENGTH}
                hoverScale={BACK_BUTTON_HOVER_SCALE}
                tapScale={BACK_BUTTON_TAP_SCALE}
              >
                <TrailClearIcon />
              </GlassButton>
            </div>

            {/* A single glass-thumb-in-a-track slider — see CLAUDE.md ->
                Components -> Glass slider. This replaced three standalone
                GlassButtons (one per speed) once floating them individually
                on the field made the "which one is selected" state read as
                three separate glass surfaces rather than one control with
                three positions. */}
            <GlassSlider
              options={SPEED_SEGMENTS}
              value={speedId}
              onChange={(id) => {
                setSpeedId(id);
                onSpeed(Number(id));
              }}
              ariaLabel="Playback speed"
            />
          </div>

          {/* The console's own view switch, physically attached to the panel
              it controls — see CLAUDE.md -> Components -> Boxed tab bar.
              .rs-console-group is the one deliberate zero-gap pairing here:
              ViewTabs and the console sit flush, no gap, so the active tab
              reads as punching through the panel's own top edge rather than
              floating above it as a separate control. "Multi Robot" is
              still a stub until multi-robot simulation exists; "Testing"
              renders TestCard against placeholder data from
              src/content/testDefinitions.js until real test runs exist (see
              .rs-console-face below — all three stay mounted and cross-fade
              rather than swapping in and out, since the Single Robot face
              carries the refs the simulation frame loop paints into).
              onChange is gated on testRunning rather than passing setConsoleView
              directly — ViewTabs has no disabled concept of its own, and
              switching away from Testing mid-run is one of the navigation
              vectors the Approach & Kick Time test has to block (see
              RobotSimulator's own nav-lock effects). */}
          <div className="rs-console-group">
            <ViewTabs
              tabs={CONSOLE_VIEWS}
              value={consoleView}
              onChange={(id) => {
                if (!testRunning) setConsoleView(id);
              }}
              ariaLabel="Console view"
            />

            <aside className="rs-run-console rs-hud">
            <div className={`rs-console-face${consoleView === "single" ? " is-active" : ""}`}>
              {/* Reuses the setup step's own RoleToggle unchanged — switching
                  roles here rebuilds the running program for the other role's
                  behaviour tree and restarts the episode at its own initial
                  placement (see handleRoleSwitch in RobotSimulator), rather
                  than only relabelling a static readout. */}
              <RoleToggle
                className="rs-run-role-toggle"
                ariaLabel="Role"
                options={ROLES.map((r) => ({ id: r.id, label: r.label }))}
                value={role}
                onChange={onRoleChange}
              />

              {/* The decision state (Chase / Adjust / Kick / Find / Idle) is the
                  readout's one always-visible headline, so it sits outside
                  the flippable info below rather than flipping away with the
                  telemetry face — decisionState is set from paintReadout via
                  onRender's onDecision callback (RobotSimulator), deduped so
                  it only re-renders when the bucket/text actually changes.
                  It's also the flip control itself now: the glass-button
                  press already reads as "this responds to a tap", so a
                  second dedicated flip button alongside it would be a
                  redundant control doing the same thing — see CLAUDE.md ->
                  Components -> Glass button for the material/motion this
                  reuses unchanged, just tinted per decision bucket instead
                  of the neutral droplet fill. No visible affordance beyond
                  that (no icon, no hint text) — same restraint as any other
                  hover/press state on this page. */}
              <div className="rs-decision-row">
                <GlassButton
                  className={`rs-decision-pill rs-decision-pill--${decisionState.bucket}`}
                  onClick={() => setStatsFace((f) => (f === "telemetry" ? "log" : "telemetry"))}
                  aria-label={statsFace === "telemetry" ? "Show brain log" : "Show telemetry"}
                >
                  {decisionState.text}
                </GlassButton>

                {/* Debug comparison control: precise, ground-truth ball
                    tracking is the default. Clicking the pill is a real mode
                    switch — it flips SimHost.usePreciseBall to false, turning
                    on the realistic 120°/10m/confidence/jitter model in
                    perception.js — and reveals two always-computed
                    visualization toggles (FOV cone, perceived-ball marker)
                    plus a cancel that reverts both the mode (back to precise)
                    and the UI. See CLAUDE.md -> Motion -> Spring-based
                    controls (SPRING_SPLIT) for the split/recombine animation,
                    and -> Components -> Glass button for the frost fill's
                    white-background exception, both scoped to this one
                    control. */}
                {/* mode="popLayout" (not "wait"): the exiting side is pulled out of
                    .rs-decision-row's flex flow the instant the other mounts, so both
                    animate concurrently instead of the old fade-out-then-fade-in
                    sequencing. .rs-decision-row itself carries position: relative so
                    that pop lands correctly rather than against some further-up
                    ancestor. */}
                <AnimatePresence mode="popLayout" initial={false}>
                  {!ballVisionExpanded ? (
                    <motion.div
                      key="collapsed"
                      ref={pillRef}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.4 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                      transition={reduceMotion ? { duration: 0 } : SPRING_SPLIT}
                    >
                      <GlassButton
                        variant="glass"
                        className="rs-ball-vision-btn"
                        onClick={() => {
                          if (runtimeRef.current) runtimeRef.current.host.usePreciseBall = false;
                          setBallVisionExpanded(true);
                        }}
                      >
                        Limit Ball Vision
                      </GlassButton>
                    </motion.div>
                  ) : (
                    <motion.div key="expanded" className="rs-ball-vision-cluster">
                      {[
                        {
                          key: "fov",
                          node: (
                            <GlassButton
                              variant="frost"
                              selected={showFov}
                              className="rs-ball-vision-toggle"
                              aria-pressed={showFov}
                              aria-label="Toggle field-of-vision overlay"
                              reach={BACK_BUTTON_REACH_PX}
                              pull={BACK_BUTTON_PULL_PX}
                              strength={BACK_BUTTON_PULL_STRENGTH}
                              hoverScale={BACK_BUTTON_HOVER_SCALE}
                              tapScale={BACK_BUTTON_TAP_SCALE}
                              onClick={() => {
                                const v = !showFov;
                                setShowFov(v);
                                onSetShowFov(v);
                              }}
                            >
                              <Eye aria-hidden="true" />
                            </GlassButton>
                          ),
                        },
                        {
                          key: "perceived",
                          node: (
                            <GlassButton
                              variant="frost"
                              selected={showPerceivedBall}
                              className="rs-ball-vision-toggle"
                              aria-pressed={showPerceivedBall}
                              aria-label="Toggle perceived ball location marker"
                              reach={BACK_BUTTON_REACH_PX}
                              pull={BACK_BUTTON_PULL_PX}
                              strength={BACK_BUTTON_PULL_STRENGTH}
                              hoverScale={BACK_BUTTON_HOVER_SCALE}
                              tapScale={BACK_BUTTON_TAP_SCALE}
                              onClick={() => {
                                const v = !showPerceivedBall;
                                setShowPerceivedBall(v);
                                onSetShowPerceivedBall(v);
                              }}
                            >
                              <img src={footballIcon} alt="" className="rs-ball-icon" />
                            </GlassButton>
                          ),
                        },
                        {
                          key: "cancel",
                          node: (
                            <GlassButton
                              variant="glass"
                              className="rs-ball-vision-cancel"
                              aria-label="Cancel: revert to precise ball perception"
                              reach={BACK_BUTTON_REACH_PX}
                              pull={BACK_BUTTON_PULL_PX}
                              strength={BACK_BUTTON_PULL_STRENGTH}
                              hoverScale={BACK_BUTTON_HOVER_SCALE}
                              tapScale={BACK_BUTTON_TAP_SCALE}
                              onClick={collapseBallVision}
                            >
                              <X aria-hidden="true" />
                            </GlassButton>
                          ),
                        },
                      ].map(({ key, node }, i) => {
                        // How far this circle sits, in local x, from the pill's own
                        // measured centre — its own centre-x (BALL_VISION_CENTERS_PX[i])
                        // minus the pill's centre, negated so it reads as "where this
                        // circle starts relative to its own resting flex position".
                        // Expanding, all three start at this offset (converged on the
                        // pill's centre) and animate to x: 0 (their natural, separated
                        // flex position) — so they visually emerge from one point, the
                        // same droplet, rather than fading in already apart. Collapsing
                        // reverses it: they travel back to that same point and vanish
                        // there, right as the pill reappears in its place.
                        const originX = pillCenterPxRef.current - BALL_VISION_CENTERS_PX[i];
                        // Expand stagger runs eye -> football -> cancel (left to right,
                        // the order they end up in); collapse reverses it — cancel
                        // gathers in first, eye last — so the recombine reads as the
                        // opposite motion of the split rather than the same order twice.
                        const stagger = i * 0.06;
                        const reverseStagger = (BALL_VISION_CENTERS_PX.length - 1 - i) * 0.06;
                        return (
                          <motion.div
                            key={key}
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.3, x: originX }}
                            animate={{
                              opacity: 1,
                              scale: 1,
                              x: 0,
                              transition: reduceMotion ? { duration: 0 } : { ...SPRING_SPLIT, delay: stagger },
                            }}
                            exit={{
                              opacity: 0,
                              scale: 0.3,
                              x: originX,
                              transition: reduceMotion
                                ? { duration: 0 }
                                : { ...SPRING_SPLIT, delay: reverseStagger },
                            }}
                          >
                            {node}
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* No nested card surface — telemetry and log sit directly on
                  the console's own glass background (.rs-run-console is
                  already the HUD, which has already blurred the field behind
                  it; a second backdrop-filter here would blur an
                  already-blurred backdrop for nothing). This wrapper only
                  owns the stacking/scroll geometry the flip needs. */}
              <div className="rs-run-info">
                {/* Both faces stay mounted at all times — paintReadout/paintNotes/
                    drainLogs write into readoutRef/detailRef/notesRef/logRef on
                    every simulation frame, and unmounting either face would break
                    those refs. The toggle only changes which is on top. */}
                <div className={`rs-stats-face${statsFace === "telemetry" ? " is-active" : ""}`}>
                  <div ref={readoutRef} className="rs-stats-readout" />
                  <details className="rs-diag-details">
                    <summary>
                      More detail
                      <ChevronIcon />
                    </summary>
                    <div className="rs-diag-full">
                      <table ref={detailRef} className="rs-stats-detail-table" />
                      <div ref={notesRef} className="rs-run-notes" />
                    </div>
                  </details>
                </div>

                <div className={`rs-stats-face${statsFace === "log" ? " is-active" : ""}`}>
                  <div className="rs-log-stream-wrap">
                    <pre
                      ref={logRef}
                      className="rs-log-stream"
                      onClick={onCopyLog}
                      title="Click to copy"
                    />
                    <span
                      className={`rs-log-copied${logCopied ? " is-visible" : ""}`}
                      aria-live="polite"
                    >
                      Copied!
                    </span>
                    {logAlertOpen ? (
                      <div className="rs-log-alert-detail">
                        <Notice
                          tone={runtimeError ? "error" : "muted"}
                          title={runtimeError ? "Execution stopped" : "Cannot keep real time"}
                        >
                          {runtimeError ? (
                            <>
                              {runtimeError.message} The robot is halted. Fix the pasted code or the
                              missing symbol, then Run again.
                            </>
                          ) : (
                            <>
                              The interpreted tick is taking longer than 10&nbsp;ms. Frames are being
                              dropped; lower the speed multiplier for an accurate trace.
                            </>
                          )}
                        </Notice>
                      </div>
                    ) : null}
                  </div>
                  {runtimeError || overrun ? (
                    <button
                      type="button"
                      className="rs-log-alert"
                      onClick={() => setLogAlertOpen((v) => !v)}
                    >
                      <StatusIndicator
                        tone={runtimeError ? "error" : "muted"}
                        label={runtimeError ? "Execution stopped — tap for detail" : "Frames dropped — tap for detail"}
                      />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={`rs-console-face${consoleView === "multi" ? " is-active" : ""}`}>
              <div className="rs-console-placeholder">
                <Notice tone="muted" title="Coming soon">
                  Multi-robot simulation isn't built yet — this tab will host coordinated multi-robot runs.
                </Notice>
              </div>
            </div>

            <div className={`rs-console-face${consoleView === "reports" ? " is-active" : ""}`}>
              <TestCard tests={testDefinitions} onStart={onTestStart} onCompare={onTestCompare} />
            </div>
            </aside>
          </div>
        </div>
      </div>

      {/* rs-run-layout above is position: fixed, so it occupies no space in
          normal flow — window.scrollY needs somewhere to go at all for the
          drawer's scrub to read, and this is the only thing left to provide
          it now that the constants/assumptions reference is gone. Purely
          functional, never visible: nothing renders here to reach. */}
      <div className="rs-run-spacer" aria-hidden="true" />
    </>
  );
}

/* --------------------------------------------------------------- readouts */

// Everything the run tracks. The compact card shows decision/robot/ball/cost
// up front (COMPACT_FIELDS); the "More detail" disclosure gets the rest
// (DETAIL_FIELDS) — split from this one list so the two can never drift out
// of sync with what paintReadout actually knows how to fill in.
const FIELDS = [
  ["decision", "decision"],
  ["node", "node ticked"],
  ["targetType", "chase target type"],
  ["ballRange", "ball range"],
  ["deltaDir", "deltaDir (kickDir − robot→ball)"],
  ["kickDir", "kickDir"],
  ["kickType", "kickType"],
  ["cmd", "commanded vx / vy / vθ"],
  ["actual", "actual vx / vy / vθ"],
  ["robot", "robot pose"],
  ["ball", "ball pos / speed"],
  ["elapsed", "elapsed"],
  ["cost", "interpreter cost"],
];

const COMPACT_KEYS = ["robot", "ball", "cost"];
const COMPACT_LABELS = { robot: "robot pose", ball: "ball pose", cost: "interpreter cost" };
const DETAIL_FIELDS = FIELDS.filter(([key]) => !["decision", ...COMPACT_KEYS].includes(key));

// Mirrors renderer.js's DECISION_COLOR grouping: chase/adjust/kick are the
// only branches this simulator actually runs (see "what this simulation does
// not model" below the layout), everything else is idle.
const DECISION_BUCKET = {
  chase: "chase",
  adjust: "adjust",
  kick: "kick",
  cross: "kick",
  // The robot actively searching (see runtime.js's tickFindBall() /
  // GoalieZoneFindBall) is real, simulated motion -- its own bucket, not idle.
  find: "find",
  zone_find: "find",
  retreat: "idle",
  assist: "idle",
};

// The pill's own label is just the bucket, not the raw decision name or node
// (dropped the "· StrikerChase" / "· not simulated" / "· episode ended: …"
// suffixes it used to carry) — a simplified, always-one-of-these-five
// readout rather than a detailed trace. The full decision/node/result is
// still in the compact rows and "More detail" table below it.
const DECISION_BUCKET_LABEL = {
  chase: "Chase",
  adjust: "Adjust",
  kick: "Kick",
  find: "Find",
  idle: "Idle",
};

// One raw decision gets its own label instead of its bucket's: "cross" still
// buckets under "kick" (same pill color/state), but reads as "Cross" rather
// than the generic "Kick" so the two branches stay distinguishable at a
// glance. Same for "zone_find" under "find" -- the goalkeeper's own search
// variant. Keyed by the raw decision name, not the bucket.
const DECISION_LABEL_OVERRIDE = { cross: "Cross", zone_find: "Zone Find" };

/**
 * Written straight into the DOM rather than through React state: this runs on every
 * animation frame, and re-rendering the tree that often would dominate the frame budget.
 * `onDecision(bucket, text)` reports the decision pill's state to the caller instead of
 * painting a DOM node directly — the pill is a real React GlassButton now (SimStep), and
 * the caller is responsible for only calling setState when the value actually changed (see
 * onRender's own comment). `root` gets the three compact rows; `detailTable` (inside the
 * "More detail" disclosure) gets everything else FIELDS knows about.
 */
function paintReadout(onDecision, root, detailTable, world, runtime, engine) {
  if (!root) return;
  let rows = root.querySelector(".rs-stat-rows");
  if (!rows) {
    rows = document.createElement("div");
    rows.className = "rs-stat-rows";
    rows.innerHTML = COMPACT_KEYS.map(
      (key) => `<div class="rs-stat-row"><span>${COMPACT_LABELS[key]}</span><span data-k="${key}">—</span></div>`
    ).join("");
    root.appendChild(rows);
  }
  if (detailTable && !detailTable.childElementCount) {
    detailTable.innerHTML = DETAIL_FIELDS.map(
      ([key, label]) => `<tr><td>${label}</td><td data-k="${key}">—</td></tr>`
    ).join("");
  }

  const t = runtime.telemetry || {};
  const d = runtime.host.data;
  const set = (container, key, text) => {
    if (!container) return;
    const cell = container.querySelector(`[data-k="${key}"]`);
    if (cell && cell.textContent !== text) cell.textContent = text;
  };

  const decision = t.decision || "—";
  const bucket = DECISION_BUCKET[decision] || "idle";
  const label = DECISION_LABEL_OVERRIDE[decision] || DECISION_BUCKET_LABEL[bucket];
  if (onDecision) onDecision(bucket, label);

  const w = t.decideWatched || {};
  set(rows, "robot", `${world.robot.x.toFixed(2)}, ${world.robot.y.toFixed(2)} @ ${world.robot.theta.toFixed(2)}`);
  set(
    rows,
    "ball",
    `${world.ball.x.toFixed(2)}, ${world.ball.y.toFixed(2)} · ${Math.hypot(world.ball.vx, world.ball.vy).toFixed(2)} m/s`
  );
  const stats = engine ? engine.stats() : null;
  set(rows, "cost", stats ? `${stats.stepCostMs.toFixed(3)} ms/tick` : "—");

  set(detailTable, "node", t.simulatedNode || "none");
  set(detailTable, "targetType", t.targetType || "—");
  set(detailTable, "ballRange", `${d.ball.range.toFixed(3)} m`);
  set(detailTable, "deltaDir", typeof w.deltaDir === "number" ? `${w.deltaDir.toFixed(3)} rad` : "—");
  set(detailTable, "kickDir", `${Number(d.kickDir || 0).toFixed(3)} rad`);
  set(detailTable, "kickType", String(d.kickType || "—"));
  const c = runtime.host.command;
  set(detailTable, "cmd", `${c.vx.toFixed(2)} / ${c.vy.toFixed(2)} / ${c.vtheta.toFixed(2)}`);
  set(
    detailTable,
    "actual",
    `${world.robot.vx.toFixed(2)} / ${world.robot.vy.toFixed(2)} / ${world.robot.vtheta.toFixed(2)}`
  );
  set(detailTable, "elapsed", `${world.t.toFixed(2)} s`);
}

/**
 * What the run had to assume. Discovered while executing, not while parsing, so it can
 * only be reported here: ports the XML and header did not supply, config getters and
 * Brain methods the host does not model, and identifiers that fell through to node
 * member state. All of these are places the simulation may diverge from the robot.
 */
function paintNotes(root, runtime) {
  if (!root) return;
  const host = runtime.host;
  const groups = [
    ["Ports not supplied (resolved to 0)", [...host.missingPorts]],
    ["Config getters not modelled (returned 0)", [...host.missingConfig]],
    ["Brain members not modelled (inert)", [...host.missingBrainMethods]],
    ["Identifiers assumed to be node state (start 0)", [...new Set(runtime.unknownSymbols)]],
  ].filter(([, items]) => items.length > 0);

  const signature = groups.map(([k, v]) => `${k}:${v.length}`).join("|");
  if (root.dataset.sig === signature) return;
  root.dataset.sig = signature;

  if (groups.length === 0) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML =
    `<h3>Assumptions this run made</h3>` +
    groups
      .map(
        ([label, items]) =>
          `<div class="rs-note-group"><span class="rs-note-label">${label}</span>` +
          `<span class="rs-note-items">${items.join(", ")}</span></div>`
      )
      .join("");
}

function drainLogs(pre, runtime, countRef) {
  if (!pre) return;
  // runtime.logSeq increments on every strategy() call and never resets when the ring
  // evicts old entries -- unlike runtime.logs.length, which plateaus once the ring hits
  // its cap. Using length here would make this check silently stop firing forever the
  // moment the cap is first reached (400 total log calls used to arrive within about a
  // second of simulated time), freezing the panel on stale content while newer entries
  // kept arriving unseen. runtime.logs itself already holds only level === "strategy"
  // entries -- debug()/log() calls are dropped at the source in runtime.js, since nothing
  // in this UI displays them and they were the high-frequency noise evicting the rare
  // strategy entries in the first place.
  if (runtime.logSeq === countRef.current) return;
  // brain->log->strategy() calls are deliberately multi-line diagnostic dumps (see
  // StrikerDecide's transition log: team/ball/kick/gates/robot/thresholds on separate
  // lines, each pre-indented by the format string itself) -- show the message in full,
  // not just its first line, or all of that detail is silently discarded. Only the first
  // line gets the [t] [scope] prefix; the rest is printed exactly as the code formatted
  // it, with no re-indenting.
  //
  // Not every strategy() call is change-gated the way StrikerDecide's transition log is --
  // e.g. GoalieChase's "between ball and own goal" line (brain_tree.cpp:895) fires every
  // tick for as long as that branch is active, with no dedup in the C++ itself. Left alone,
  // one chatty call like that fills the whole window and pushes out everything else. Collapse
  // consecutive entries with the same scope+message into one line with a repeat count and
  // time range, so a real run of spam takes one line instead of forty.
  const raw = runtime.logs.slice(-300);
  const collapsed = [];
  for (const l of raw) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.scope === l.scope && last.msg === l.msg) {
      last.count += 1;
      last.tEnd = l.t;
    } else {
      collapsed.push({ scope: l.scope, msg: l.msg, tStart: l.t, tEnd: l.t, count: 1 });
    }
  }
  const text = collapsed
    .slice(-50)
    .map((e) => {
      const time = e.count > 1 ? `t=${e.tStart.toFixed(2)}-${e.tEnd.toFixed(2)}s (x${e.count})` : `t=${e.tStart.toFixed(2)}s`;
      return `[${time}] [${e.scope}] ${e.msg}`;
    })
    .join("\n");
  pre.textContent = text;
  pre.scrollTop = pre.scrollHeight;
  countRef.current = runtime.logSeq;
}
