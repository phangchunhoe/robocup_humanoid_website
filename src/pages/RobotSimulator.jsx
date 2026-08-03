import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "../components/Header.jsx";
import SegmentedControl from "../components/SegmentedControl.jsx";
import StatusIndicator from "../components/StatusIndicator.jsx";
import InfoHint from "../components/InfoHint.jsx";
import SelectableCard from "../components/SelectableCard.jsx";
import ProgressBar from "../components/ProgressBar.jsx";
import Notice from "../components/Notice.jsx";
import { TABS, INTRO, CONFIG_NOTE, expectedRelPath } from "../content/simulatorPasteGuide.js";
import { buildProgram } from "../lib/sim/runtime.js";
import { createWorld, stepWorld, DEFAULT_PHYSICS } from "../lib/sim/physics.js";
import { createEngine, FIXED_DT } from "../lib/sim/engine.js";
import { createRenderer } from "../lib/sim/renderer.js";
import { VIEW_W, VIEW_H, toField } from "../lib/sim/field.js";
import { CONFIG_DEFAULTS } from "../lib/sim/host.js";
import { runSelfTest } from "../lib/cpp/selftest.js";
import { REQUIRED_BY_ROLE } from "../lib/cpp/extract.js";
import optimusUrl from "../images/optimus.webp";
import "./RobotSimulator.css";

// One status per required file, folding "is this required" and "did it load"
// into a single state — every file this app asks for is required, so a
// separate "required" marker would just repeat itself three times.
function fileStatus(tabId, folderScan, sources) {
  const scanResult = folderScan && folderScan.results.find((r) => r.tabId === tabId);
  if (scanResult) {
    return scanResult.found
      ? { tone: "success", label: "Found" }
      : { tone: "error", label: "Missing" };
  }
  const hasContent = (sources[tabId] || "").trim().length > 0;
  return hasContent ? { tone: "success", label: "Loaded" } : { tone: "muted", label: "Required" };
}

const STORAGE_KEY = "robot-simulator-source-v1";

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
  const [role, setRole] = useState((stored && stored.role) || "striker");
  const [activeTab, setActiveTab] = useState("cpp");
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

  // Re-parse when the paste settles.
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
    paintReadout(readoutRef.current, world, runtime, engineRef.current);
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

  const handleStepOnce = () => {
    if (!engineRef.current) return;
    if (engineRef.current.isRunning()) {
      engineRef.current.stop();
      setRunning(false);
    }
    engineRef.current.stepOnce();
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
      <Header />
      <div className="robot-simulator-page">
        {/* Atmospheric hero element — decorative, so it is hidden from
            assistive tech, and it belongs to the landing step only. It sits
            outside the shell because it is anchored to the viewport edge, not
            to the content column. */}
        {step === "edit" ? (
          <div className="rs-hero-media" aria-hidden="true">
            <img src={optimusUrl} alt="" decoding="async" />
          </div>
        ) : null}

        <div className="rs-shell">
          <header className="rs-hero">
            <h1 className="rs-headline">Erecting Simulator</h1>
            <p className="rs-subhead">
              Developed by Chun Hoe
              <InfoHint text={INTRO} label="About this simulator" />
            </p>
          </header>

          {step === "edit" ? (
            <EditorStep
              role={role}
              setRole={(r) => {
                setRole(r);
                setPlacement(INITIAL_PLACEMENT[r]);
              }}
              roles={ROLES}
              roleMeta={roleMeta}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              sources={sources}
              setSources={setSources}
              report={report}
              buildError={buildError}
              required={required}
              canRun={canRun}
              onRun={handleRun}
              selfTest={selfTest}
              onSelfTest={() => setSelfTest(runSelfTest())}
              folderInputRef={folderInputRef}
              folderBusy={folderBusy}
              folderScan={folderScan}
              onFolderInputChange={handleFolderInputChange}
            />
          ) : (
            <SimStep
              svgRef={svgRef}
              readoutRef={readoutRef}
              notesRef={notesRef}
              logRef={logRef}
              running={running}
              onTogglePlay={togglePlay}
              onStepOnce={handleStepOnce}
              onReset={handleReset}
              onSpeed={(v) => engineRef.current && engineRef.current.setSpeed(v)}
              physics={physics}
              setPhysics={setPhysics}
              overrun={overrun}
              runtimeError={runtimeError}
              roleMeta={roleMeta}
              onBack={() => {
                if (engineRef.current) engineRef.current.stop();
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

function EditorStep(props) {
  const {
    role, setRole, roles, roleMeta, activeTab, setActiveTab, sources, setSources,
    report, buildError, required, canRun, onRun, selfTest, onSelfTest,
    folderInputRef, folderBusy, folderScan, onFolderInputChange,
  } = props;

  // Jumps to "paste" automatically once a folder scan lands, since that's
  // where the loaded files become visible.
  const [inputMode, setInputMode] = useState("folder");
  useEffect(() => {
    if (folderScan) setInputMode("paste");
  }, [folderScan]);

  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
  const value = sources[tab.id] || "";
  const lineCount = value ? value.split("\n").length : 1;
  const activeStatus = fileStatus(tab.id, folderScan, sources);

  // Progress reflects how close the page is to being runnable: one unit per
  // required file that has content, plus a final unit for a clean parse.
  const filesLoaded = TABS.filter((t) => (sources[t.id] || "").trim().length > 0).length;
  const progressValue = canRun ? TABS.length + 1 : filesLoaded;
  const progressHint = canRun
    ? "Ready to run"
    : `${filesLoaded} of ${TABS.length} files loaded`;

  const handleKeyDown = (evt) => {
    if (evt.key !== "Tab") return;
    evt.preventDefault();
    const el = evt.target;
    const { selectionStart: s, selectionEnd: e } = el;
    const next = `${value.slice(0, s)}  ${value.slice(e)}`;
    setSources({ ...sources, [tab.id]: next });
    window.requestAnimationFrame(() => {
      el.selectionStart = s + 2;
      el.selectionEnd = s + 2;
    });
  };

  return (
    /* The width constraint lives on the wrapper, the column layout on the
       child — the right ~42% of the hero area belongs to the image. */
    <div className="rs-editor-layout">
      <div className="rs-init-col">
        <ProgressBar
          surface
          value={progressValue}
          max={TABS.length + 1}
          label="Load source"
          hint={progressHint}
        />

        <section className="rs-panel rs-role-section">
          <SelectableCard
            name="role"
            legend="Role"
            options={roles.map((r) => ({ id: r.id, label: r.label }))}
            value={role}
            onChange={setRole}
          />
          <span className="rs-role-hint">
            Expects <code className="rs-mono">{roleMeta.xml}</code>
          </span>
        </section>

        <section className="rs-panel rs-source-section">
          <div className="rs-source-header">
            <span className="rs-panel-label">Source</span>
            <SegmentedControl
              ariaLabel="Source input method"
              segments={[
                { id: "folder", label: "Open folder", panelId: "rs-panel-folder" },
                { id: "paste", label: "Paste source", panelId: "rs-panel-paste" },
              ]}
              value={inputMode}
              onChange={setInputMode}
            />
          </div>

          {/* Keyed so switching modes remounts and replays the cross-fade. */}
          <div className="rs-source-panel" key={inputMode}>
            {inputMode === "folder" ? (
              <div
                id="rs-panel-folder"
                className="rs-source-body"
                role="tabpanel"
                aria-labelledby="segment-folder"
              >
                <div className="rs-folder-action-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={folderBusy}
                    onClick={() => folderInputRef.current && folderInputRef.current.click()}
                  >
                    {folderBusy ? "Scanning…" : "Choose folder"}
                  </button>
                  <InfoHint
                    label="About opening a folder"
                    text="Select your Robocup-Humanoid- checkout, or its src/brain folder. The files below are matched by relative path. Manual paste still works per file."
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
                    {folderScan.results.map((r) => {
                      const t = TABS.find((entry) => entry.id === r.tabId);
                      return (
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
                                : `Paste it manually under ${t ? t.label : r.tabId}`}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rs-empty">Nothing loaded yet.</p>
                )}
              </div>
            ) : (
              <div
                id="rs-panel-paste"
                className="rs-source-body"
                role="tabpanel"
                aria-labelledby="segment-paste"
              >
                <div className="rs-file-switch-row">
                  <SegmentedControl
                    size="sm"
                    ariaLabel="Which file to paste"
                    segments={TABS.map((t) => ({ id: t.id, label: t.label }))}
                    value={activeTab}
                    onChange={setActiveTab}
                  />
                  <StatusIndicator
                    tone={activeStatus.tone}
                    label={activeStatus.label}
                    animateKey={`${tab.id}-${activeStatus.tone}-${activeStatus.label}`}
                  />
                </div>

                <div className="rs-file-meta">
                  <code className="rs-mono rs-file-path">{tab.file}</code>
                  <InfoHint text={tab.hint} label={`About ${tab.label}`} />
                </div>

                <div className="code-editor">
                  <pre className="gutter" aria-hidden="true">
                    {Array.from({ length: lineCount }, (_, i) => i + 1).join("\n")}
                  </pre>
                  <textarea
                    spellCheck="false"
                    value={value}
                    placeholder={tab.placeholder}
                    onChange={(evt) => setSources({ ...sources, [tab.id]: evt.target.value })}
                    onKeyDown={handleKeyDown}
                  />
                </div>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSources({ ...sources, [tab.id]: "" })}
                  disabled={!value}
                >
                  Clear this file
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rs-run-section">
          <div className="rs-run-row">
            <button type="button" className="btn btn-primary" disabled={!canRun} onClick={onRun}>
              Run simulation
            </button>
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

        <section className="rs-panel rs-diagnostics">
          <span className="rs-panel-label">Parse diagnostics</span>
          {buildError ? (
            <Notice tone="error" title="Build failed" glyph={false}>
              {buildError}
            </Notice>
          ) : null}
          {!report ? (
            <p className="rs-hint">
              Load <code className="rs-mono">brain_tree.cpp</code> and a behaviour-tree XML to
              see what was extracted.
            </p>
          ) : (
            <DiagnosticsSummary report={report} required={required} />
          )}
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

function SimStep(props) {
  const {
    svgRef, readoutRef, notesRef, logRef, running, onTogglePlay, onStepOnce, onReset, onSpeed,
    physics, setPhysics, overrun, runtimeError, roleMeta, onBack,
  } = props;

  return (
    <>
      <div className="controls-panel">
        <button type="button" className="ghost" onClick={onBack}>
          ← Back to editor
        </button>
        <button type="button" className="primary" onClick={onTogglePlay}>
          {running ? "⏸ Pause" : "▶ Play"}
        </button>
        <button type="button" onClick={onStepOnce}>
          Step 1 tick
        </button>
        <button type="button" onClick={onReset}>
          ⟲ Reset
        </button>
        <label className="speed">
          Speed
          <select defaultValue="1" onChange={(e) => onSpeed(Number(e.target.value))}>
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1">1× (real time)</option>
            <option value="2">2×</option>
            <option value="4">4×</option>
          </select>
        </label>
        <span className="run-role">{roleMeta.label}</span>
      </div>

      {runtimeError ? (
        <div className="banner error">
          <strong>Execution stopped:</strong> {runtimeError.message}
          <span className="banner-note">
            The robot is halted. Fix the pasted code or the missing symbol, then Run again.
          </span>
        </div>
      ) : null}
      {overrun ? (
        <div className="banner warn">
          Cannot keep real time — the interpreted tick is taking longer than 10&nbsp;ms.
          Frames are being dropped; lower the speed multiplier for an accurate trace.
        </div>
      ) : null}

      <div className="layout">
        <section className="panel field-panel">
          <div className="field-wrap">
            <svg ref={svgRef} id="field" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} />
          </div>
          <div className="legend">
            <span><i className="swatch chase" /> chase</span>
            <span><i className="swatch adjust" /> adjust</span>
            <span><i className="swatch kick" /> kick</span>
            <span><i className="swatch other" /> not simulated</span>
            <span className="legend-note">
              Drag the ball, the robot, or the heading handle to set up a scenario.
            </span>
          </div>
        </section>

        <aside className="panel console">
          {/* Populated imperatively by paintReadout/paintNotes on every frame; React
              deliberately renders no children here so the two never fight. */}
          <div ref={readoutRef} className="readout" />
          <div ref={notesRef} className="runtime-notes" />

          <div className="log-panel">
            <h3>brain-&gt;log-&gt;strategy(...) output</h3>
            <pre ref={logRef} className="log-stream" />
          </div>

          <div className="sliders">
            <h3>Physics</h3>
            {SLIDERS.map((s) => (
              <label key={s.key} className="slider">
                <span className="slider-label">
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
                <span className="slider-note">{s.note}</span>
              </label>
            ))}
            <label className="slider">
              <span className="slider-label">
                RNG seed<em>{physics.seed}</em>
              </span>
              <input
                type="number"
                value={physics.seed}
                onChange={(e) => setPhysics({ ...physics, seed: Number(e.target.value) || 1 })}
              />
              <span className="slider-note">
                Same seed, same scatter — reset to re-run a scenario identically.
              </span>
            </label>
          </div>
        </aside>
      </div>

      <details className="formula-ref">
        <summary>Constants this run assumed, and what the simulation omits</summary>
        <div className="ref-body">
          <h4>config.yaml values (hardcoded — there is no config tab)</h4>
          <table className="const-table">
            <tbody>
              {Object.keys(CONFIG_DEFAULTS).map((k) => (
                <tr key={k}>
                  <td><code>{k}</code></td>
                  <td>{String(CONFIG_DEFAULTS[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4>What this simulation does not model</h4>
          <ul>
            <li>
              <strong>Perception is perfect.</strong> <code>ball_location_known</code> is
              always true and the ball position carries no noise, so the <code>find</code>
              branch, the close-ball guard and the anti-phantom latch never fire. One
              consequence: a borderline gate (e.g. <code>Kick::onStart</code>&rsquo;s
              straight-kick alignment check, or a decision that flip-flops between two
              states whose commands cancel out) can leave the robot motionless
              indefinitely, since its pose is bit-for-bit unchanged tick to tick with no
              noise to nudge it past the threshold. On hardware this resolves within a
              second or two on its own; here it can persist. If the robot looks frozen,
              check the log panel and readout for the decision it is stuck on.
            </li>
            <li>
              <strong>One robot, empty pitch.</strong> <code>distToObstacle()</code> always
              returns 99 m, so obstacle avoidance never engages and no teammate or opponent
              exists. Teammate-dependent branches (assist, cost ranking, zone reports) are
              inert.
            </li>
            <li>
              <strong>Normal play only.</strong> GameController state is fixed to PLAY, so
              free kicks, corners, throw-ins, penalties and kickoff branches are skipped.
            </li>
            <li>
              <strong>No walk dynamics.</strong> The robot is a rate-limited holonomic base;
              there is no gait, no CoM sway, no falling, and no head or camera model.
            </li>
            <li>
              <strong>The kick is contact physics, not an animation.</strong> That matches
              the C++, where Kick::onRunning is a walk-through strike, but the ball leaves at
              a tuned multiple of foot speed rather than from a modelled foot swing.
            </li>
            <li>
              Nodes outside chase/adjust/kick (FindBall, Assist, GoToGoalBlockingPosition,
              RLVisionKick, the set-piece subtrees) are not run — the robot holds position
              and the decision is reported as “not simulated”.
            </li>
          </ul>

          <h4>Simulation loop</h4>
          <p>
            Fixed timestep of {FIXED_DT}s, one brain tick per step, matching{" "}
            <code>#define HZ 100</code> in <code>main.cpp</code>. Display refresh rate does
            not affect the trajectory.
          </p>
        </div>
      </details>
    </>
  );
}

/* --------------------------------------------------------------- readouts */

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

/**
 * Written straight into the DOM rather than through React state: this runs on every
 * animation frame, and re-rendering the tree that often would dominate the frame budget.
 */
function paintReadout(root, world, runtime, engine) {
  if (!root) return;
  let table = root.querySelector(".readout-table");
  if (!table) {
    const pillEl = document.createElement("div");
    pillEl.className = "scenario-pill";
    pillEl.dataset.role = "pill";
    pillEl.textContent = "—";
    root.appendChild(pillEl);

    table = document.createElement("table");
    table.className = "readout-table";
    table.innerHTML = FIELDS.map(
      ([key, label]) => `<tr><td>${label}</td><td data-k="${key}">—</td></tr>`
    ).join("");
    root.appendChild(table);
  }

  const t = runtime.telemetry || {};
  const d = runtime.host.data;
  const set = (key, text) => {
    const cell = table.querySelector(`[data-k="${key}"]`);
    if (cell && cell.textContent !== text) cell.textContent = text;
  };

  const pill = root.querySelector('[data-role="pill"]');
  const decision = t.decision || "—";
  const known = ["chase", "adjust", "kick", "cross", "find", "retreat"];
  pill.className = `scenario-pill state-${known.includes(decision) ? decision : "other"}`;
  pill.textContent = world.result
    ? `${decision.toUpperCase()} · episode ended: ${world.result.replace("_", " ")}`
    : decision.toUpperCase() + (t.simulatedNode ? ` · ${t.simulatedNode}` : " · not simulated");

  const w = t.decideWatched || {};
  set("decision", decision);
  set("node", t.simulatedNode || "none");
  set("targetType", t.targetType || "—");
  set("ballRange", `${d.ball.range.toFixed(3)} m`);
  set("deltaDir", typeof w.deltaDir === "number" ? `${w.deltaDir.toFixed(3)} rad` : "—");
  set("kickDir", `${Number(d.kickDir || 0).toFixed(3)} rad`);
  set("kickType", String(d.kickType || "—"));
  const c = runtime.host.command;
  set("cmd", `${c.vx.toFixed(2)} / ${c.vy.toFixed(2)} / ${c.vtheta.toFixed(2)}`);
  set(
    "actual",
    `${world.robot.vx.toFixed(2)} / ${world.robot.vy.toFixed(2)} / ${world.robot.vtheta.toFixed(2)}`
  );
  set(
    "robot",
    `${world.robot.x.toFixed(2)}, ${world.robot.y.toFixed(2)} @ ${world.robot.theta.toFixed(2)}`
  );
  set(
    "ball",
    `${world.ball.x.toFixed(2)}, ${world.ball.y.toFixed(2)} · ${Math.hypot(world.ball.vx, world.ball.vy).toFixed(2)} m/s`
  );
  set("elapsed", `${world.t.toFixed(2)} s`);
  const stats = engine ? engine.stats() : null;
  set("cost", stats ? `${stats.stepCostMs.toFixed(3)} ms/tick` : "—");
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
          `<div class="note-group"><span class="note-label">${label}</span>` +
          `<span class="note-items">${items.join(", ")}</span></div>`
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
