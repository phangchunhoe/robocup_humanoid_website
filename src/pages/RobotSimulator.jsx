import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CircleCheck } from "lucide-react";
import Header from "../components/Header.jsx";
import SegmentedControl from "../components/SegmentedControl.jsx";
import StatusIndicator from "../components/StatusIndicator.jsx";
import InfoHint from "../components/InfoHint.jsx";
import RoleToggle from "../components/RoleToggle.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import Notice from "../components/Notice.jsx";
import { SPRING_UI } from "../lib/motionSpring.js";
import { TABS, INTRO, CONFIG_NOTE, expectedRelPath } from "../content/simulatorPasteGuide.js";
import { buildProgram } from "../lib/sim/runtime.js";
import { createWorld, stepWorld, DEFAULT_PHYSICS } from "../lib/sim/physics.js";
import { createEngine, FIXED_DT } from "../lib/sim/engine.js";
import { createRenderer } from "../lib/sim/renderer.js";
import { VIEW_W, VIEW_H, toField } from "../lib/sim/field.js";
import { CONFIG_DEFAULTS } from "../lib/sim/host.js";
import { runSelfTest } from "../lib/cpp/selftest.js";
import { REQUIRED_BY_ROLE } from "../lib/cpp/extract.js";
import HeroField from "./HeroField.jsx";
import { useScrollScrub } from "../lib/useScrollScrub.js";
import "./RobotSimulator.css";

const STORAGE_KEY = "robot-simulator-source-v1";

// The progress bar's 3 stops: pick a role/folder, validate what was found,
// hand off to the simulation. "Simulation" is only ever reached by leaving
// this step, so the bar's own visible max while still on this page is 2/3.
const PROGRESS_STOPS = ["Setup", "Checks", "Simulation"];

const ROLES = [
  { id: "striker", label: "Striker", xml: "subtree_striker_play.xml" },
  { id: "goal_keeper", label: "Goalkeeper", xml: "subtree_goal_keeper_play.xml" },
];

const INITIAL_PLACEMENT = {
  striker: { robot: { x: -2, y: 0, theta: 0 }, ball: { x: 2, y: 0 } },
  goal_keeper: { robot: { x: -6.5, y: 0, theta: 0 }, ball: { x: -5, y: 0.8 } },
};

const SLIDERS = [
  { key: "maxWalkSpeed", label: "Max walk speed", min: 0.2, max: 2.0, step: 0.05, unit: "m/s",
    note: "robot.vx_limit in config.yaml is 1.2" },
  { key: "ballDecel", label: "Ball rolling decel", min: 0.2, max: 2.5, step: 0.05, unit: "m/s²",
    note: "turf, μ ≈ 0.08" },
  { key: "kickGain", label: "Kick gain", min: 1.0, max: 6.0, step: 0.1, unit: "×",
    note: "ball speed ÷ foot closing speed" },
  { key: "kickDirSigmaDeg", label: "Kick scatter σ", min: 0, max: 25, step: 0.5, unit: "°",
    note: "Gaussian, per strike" },
  { key: "kickDirBias", label: "Right-foot bias", min: -0.3, max: 0.3, step: 0.01, unit: "rad",
    note: "CalcKickDir compensates with kickDir -= 0.06" },
  { key: "kickSpeedJitter", label: "Speed jitter", min: 0, max: 0.6, step: 0.02, unit: "±",
    note: "multiplicative on outgoing speed" },
];

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
  const [sources, setSources] = useState(
    (stored && stored.sources) || { cpp: "", xml: "", header: "" }
  );
  const [report, setReport] = useState(null);
  const [buildError, setBuildError] = useState(null);
  const [selfTest, setSelfTest] = useState(null);
  const [running, setRunning] = useState(false);
  const [physics, setPhysics] = useState({ ...DEFAULT_PHYSICS, stanceBias: CONFIG_DEFAULTS.stance_bias });
  const [placement, setPlacement] = useState(INITIAL_PLACEMENT.striker);
  const [overrun, setOverrun] = useState(false);
  const [runtimeError, setRuntimeError] = useState(null);
  const [folderScan, setFolderScan] = useState(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const svgRef = useRef(null);
  const folderInputRef = useRef(null);
  const folderFilesRef = useRef(null);
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
  // The rAF callbacks must have stable identities: they are dependencies of the effect
  // that builds the engine, so anything that changes them tears down and rebuilds the
  // whole scene mid-run. Everything they touch therefore lives in a ref, and React state
  // is only written when a value actually changes.
  const errorRef = useRef(null);
  const overrunRef = useRef(false);

  useEffect(() => {
    document.title = "Robot Simulator — Chase / Adjust / Kick";
  }, []);

  useEffect(() => {
    placementRef.current = placement;
  }, [placement]);
  useEffect(() => {
    physicsRef.current = physics;
  }, [physics]);

  // ------------------------------------------------------------- folder open

  const scanFolder = useCallback(async (files, roleId) => {
    setFolderBusy(true);
    const results = [];
    const nextSources = {};
    for (const t of TABS) {
      const relPath = expectedRelPath(t.id, roleId);
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
    setSources((prev) => ({ ...prev, ...nextSources }));
    setFolderScan({ results });
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
    folderFilesRef.current = files;
    scanFolder(files, role);
  };

  // The XML file is role-specific (subtree_striker_play.xml vs. subtree_goal_keeper_play.xml),
  // so switching role after a folder is already loaded re-matches just that one tab rather
  // than re-reading everything and clobbering any manual edits made to the C++ or header tabs.
  useEffect(() => {
    if (!folderFilesRef.current) return;
    const relPath = expectedRelPath("xml", role);
    const match = findFolderMatch(folderFilesRef.current, relPath);
    const applyResult = (result) => {
      setFolderScan((prev) =>
        prev ? { results: prev.results.map((r) => (r.tabId === "xml" ? result : r)) } : prev
      );
    };
    if (!match) {
      applyResult({ tabId: "xml", path: relPath, found: false });
      return;
    }
    match.file.text().then(
      (text) => {
        setSources((prev) => ({ ...prev, xml: text }));
        applyResult({ tabId: "xml", path: relPath, found: true, matchedPath: match.relPath });
      },
      (err) => {
        applyResult({ tabId: "xml", path: relPath, found: false, error: String((err && err.message) || err) });
      }
    );
  }, [role]);

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
          xmlText: nextSources.xml,
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

  // Re-parse once the folder scan settles.
  useEffect(() => {
    if (!sources.cpp.trim() && !sources.xml.trim()) {
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
  }, []);

  const onRender = useCallback(() => {
    const world = worldRef.current;
    const runtime = runtimeRef.current;
    if (!world || !runtime || !rendererRef.current) return;

    rendererRef.current.update(world, runtime.telemetry);
    paintReadout(readoutRef.current, detailRef.current, world, runtime, engineRef.current);
    paintNotes(notesRef.current, runtime);
    drainLogs(logRef.current, runtime, logCountRef);

    // Surface a runtime error exactly once rather than on every frame.
    if (runtime.error && errorRef.current !== runtime.error) {
      errorRef.current = runtime.error;
      setRuntimeError(runtime.error);
      if (engineRef.current) engineRef.current.stop();
      setRunning(false);
    }
  }, []);

  const onOverrun = useCallback(() => {
    if (overrunRef.current) return;
    overrunRef.current = true;
    setOverrun(true);
  }, []);

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
    }
  }, [physics]);

  // Stage 1 -> 2: force an immediate re-parse (rather than waiting on the
  // debounce) so the checks the user is about to read reflect exactly what
  // was just loaded, then swap the setup card over to the summary.
  const handleLoadAndCheck = () => {
    parseNow(role, sources);
    setStage("checks");
  };

  const handleEditSetup = () => setStage("setup");

  const handleRun = () => {
    const result = parseNow(role, sources);
    if (!result.ok || !result.runtime) return;
    runtimeRef.current = result.runtime;
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
    setRuntimeError(null);
    setOverrun(false);
    setRunning(false);
    setStep("run");
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
    resetWorld();
    onRender();
  };


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

      if (dHeading < 0.28) dragging = "heading";
      else if (dBall < 0.3) dragging = "ball";
      else if (dRobot < 0.35) dragging = "robot";
      else return;

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
      world.result = null;
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
      {/* The site nav and this page's own headline belong to the landing/edit
          step only — the run step is a full-viewport, edge-to-edge view with
          no chrome above it, so neither renders once a simulation starts. */}
      {step === "edit" ? <Header /> : null}
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
            <HeroField />
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
              readoutRef={readoutRef}
              detailRef={detailRef}
              notesRef={notesRef}
              logRef={logRef}
              running={running}
              onTogglePlay={togglePlay}
              onReset={handleReset}
              onSpeed={(v) => engineRef.current && engineRef.current.setSpeed(v)}
              physics={physics}
              setPhysics={setPhysics}
              overrun={overrun}
              runtimeError={runtimeError}
              roleMeta={roleMeta}
              onBack={() => {
                setRunning(false);
                setStep("edit");
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ step 1 */

// Outline-only, and deliberately larger than the corner icons elsewhere on
// this page (24px vs. their 16px) — this is the button's one visual anchor,
// not an inline glyph, so it needs to read as a deliberate choice rather
// than shrink to match a smaller convention that does not apply here.
function FolderIcon() {
  return (
    <svg className="rs-btn-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
              <span className="rs-role-hint">
                Expects <code className="rs-mono">{roleMeta.xml}</code>
              </span>

              <span className="rs-panel-label">Step 2 · Source</span>
              <div className="rs-source-body">
                <div className="rs-folder-action-row">
                  {/* Local folder is the only source method now — the
                      segment that used to switch to a pasted-text mode is
                      gone, so this is the one action in the section. */}
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={folderBusy}
                    onClick={() => folderInputRef.current && folderInputRef.current.click()}
                  >
                    <FolderIcon />
                    {folderBusy
                      ? "Scanning…"
                      : folderScan
                        ? "Choose a different folder…"
                        : "Choose folder…"}
                  </button>
                  <InfoHint
                    label="About opening a folder"
                    text="Select your Robocup-Humanoid- checkout, or its src/brain folder. The files below are matched by relative path."
                  />
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

                {folderScan ? (
                  <ul className="rs-file-list">
                    {folderScan.results.map((r) => (
                      <li key={r.tabId} className="rs-file-row">
                        <code className="rs-mono rs-file-path">{r.path}</code>
                        <StatusIndicator
                          tone={r.found ? "success" : "error"}
                          label={r.found ? "Found" : "Missing"}
                          animateKey={`${r.tabId}-${r.found}`}
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
                ) : (
                  <p className="rs-empty">Nothing loaded yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="rs-checks-summary">
              <div className="rs-checks-header">
                <span className="rs-panel-label">Checks</span>
                <button type="button" className="btn btn-secondary" onClick={onEditSetup}>
                  Edit setup
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

// A single stroked cycle icon for the stats-card toggle — flips between the
// two faces, so it reads as "swap" rather than picking from a menu.
function FlipIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M3 8a5 5 0 0 1 8.5-3.5M13 8a5 5 0 0 1-8.5 3.5M11 2.5V5h2.5M5 13.5V11H2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* Same 16px grid and 1.3 stroke as FlipIcon, so the two corner controls read
   as one set. The button carries the accessible name; this is decoration. */
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

function SimStep(props) {
  const {
    svgRef, readoutRef, detailRef, notesRef, logRef, running, onTogglePlay, onReset, onSpeed,
    physics, setPhysics, overrun, runtimeError, roleMeta, onBack,
  } = props;

  const [speedId, setSpeedId] = useState("1");
  const [statsFace, setStatsFace] = useState("telemetry");
  const [logAlertOpen, setLogAlertOpen] = useState(false);
  const drawerRef = useRef(null);

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
    // The drawer no longer slides out of the field's clipped bounds — it
    // fades and scales in place — so at rest it is a full-size, fully
    // transparent box sitting over the pitch. Without this it would swallow
    // every drag meant for the ball beneath it. Hidden rather than merely
    // transparent also takes it out of the accessibility tree while closed.
    el.classList.toggle("is-hidden", progress < 0.01);
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

          {/* The only in-page way back to the editor — this step has no
              header and no site nav, so without it the sole route back is
              browser-back. Lives inside the field panel rather than the run
              layout so it stays anchored to the field in the stacked
              sub-900px layout too, where the layout itself is static. */}
          <button
            type="button"
            className="rs-back"
            onClick={onBack}
            aria-label="Back to editor"
          >
            <BackIcon />
          </button>

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
              and top-left keeps it clear of the physics drawer's bottom 40%. */}
          <div className="rs-legend rs-hud">
            <span><i className="rs-legend-swatch rs-legend-swatch--chase" /> chase</span>
            <span><i className="rs-legend-swatch rs-legend-swatch--adjust" /> adjust</span>
            <span><i className="rs-legend-swatch rs-legend-swatch--kick" /> kick</span>
            <span><i className="rs-legend-swatch rs-legend-swatch--idle" /> not simulated</span>
            <span className="rs-legend-note">
              Drag the ball, the robot, or the heading handle to set up a scenario. Scroll to
              reveal physics.
            </span>
          </div>

          {/* is-hidden from the first paint, not just from the first scrub
              frame — the class is what makes it inert while closed. */}
          <div ref={drawerRef} className="rs-physics-drawer rs-glass is-hidden">
            <span className="rs-physics-drawer-label">Physics</span>
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

        <aside className="rs-run-console rs-hud">
          <div className="rs-playback-row">
            <button
              type="button"
              className={`btn ${running ? "btn-secondary" : "btn-primary"}`}
              onClick={onTogglePlay}
            >
              {running ? "⏸ Stop" : "▶ Play"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onReset}>
              ⟲ Reset
            </button>
            <SegmentedControl
              segments={SPEED_SEGMENTS}
              value={speedId}
              onChange={(id) => {
                setSpeedId(id);
                onSpeed(Number(id));
              }}
              ariaLabel="Playback speed"
            />
            <span className="rs-role-label">{roleMeta.label}</span>
          </div>

          {/* Not .rs-glass: this sits inside the HUD, which has already
              blurred the field behind it — a second backdrop-filter would
              blur an already-blurred backdrop. Its own translucent tint is
              enough to read as raised against the HUD's surface. */}
          <div className="rs-stats-card">
            <button
              type="button"
              className="rs-stats-toggle"
              onClick={() => setStatsFace((f) => (f === "telemetry" ? "log" : "telemetry"))}
              aria-label={statsFace === "telemetry" ? "Show brain log" : "Show telemetry"}
            >
              <FlipIcon />
            </button>

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
                <pre ref={logRef} className="rs-log-stream" />
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
        </aside>
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
  find: "idle",
  retreat: "idle",
  assist: "idle",
  zone_find: "idle",
};

/**
 * Written straight into the DOM rather than through React state: this runs on every
 * animation frame, and re-rendering the tree that often would dominate the frame budget.
 * `root` gets the decision pill and the three compact rows; `detailTable` (inside the
 * card's "More detail" disclosure) gets everything else FIELDS knows about.
 */
function paintReadout(root, detailTable, world, runtime, engine) {
  if (!root) return;
  let pill = root.querySelector(".rs-decision-pill");
  let rows = root.querySelector(".rs-stat-rows");
  if (!pill) {
    pill = document.createElement("div");
    pill.className = "rs-decision-pill";
    pill.textContent = "—";
    root.appendChild(pill);

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
  pill.className = `rs-decision-pill rs-decision-pill--${bucket}`;
  pill.textContent = world.result
    ? `${decision.toUpperCase()} · episode ended: ${world.result.replace("_", " ")}`
    : decision.toUpperCase() + (t.simulatedNode ? ` · ${t.simulatedNode}` : " · not simulated");

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
