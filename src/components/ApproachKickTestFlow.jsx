import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import GlassModal from "./GlassModal.jsx";
import GlassButton from "./GlassButton.jsx";
import GlassSwitch from "./GlassSwitch.jsx";
import ProgressBar from "./ProgressBar.jsx";
import Notice from "./Notice.jsx";
import { runApproachKickTest } from "../lib/sim/approachKickTest.js";
import { buildApproachKickPdf, buildResultsJson } from "../lib/pdf/approachKickReport.js";
import { DEFAULT_PHYSICS } from "../lib/sim/physics.js";
import SLIDERS from "../content/physicsSliders.js";
import "./ApproachKickTestFlow.css";

const TOTAL_RUNS = 108;
// Same slider metadata (min/max/step/label/unit/note) the physics drawer and
// the PDF report already read, so this form's own copy can't drift from
// theirs -- see physicsSliders.js's own comment.
const JITTER_SLIDER = SLIDERS.find((s) => s.key === "ballJitterIntensity");
// Mirrors --ease-in-out from tokens.css (cubic-bezier(0.4, 0, 0.2, 1)) --
// framer-motion transitions take a literal easing curve rather than a CSS
// custom property, the same reason the two-stage button's own AnimatePresence
// crossfade (RobotSimulator.jsx) hardcodes its transition instead of reading
// one. Slightly longer than GlassSwitch's own 300ms thumb glide (GlassSwitch.css)
// so the box's reveal reads as the tail of the same motion, not a second,
// separately-timed animation.
const JITTER_BOX_EASE = [0.4, 0, 0.2, 1];
const JITTER_BOX_DURATION = 0.35;

function formatTimestamp(date) {
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The Approach & Kick Time tile's full test flow: enter distance/ball
 * position -> run the 108-case headless sweep (see
 * src/lib/sim/approachKickTest.js) -> download a PDF and copy the JSON
 * summary. One <GlassModal> whose content stage-swaps (CLAUDE.md ->
 * Components -> "Stage-swapped card content") rather than three separate
 * modals, so it reads as one flow rather than three unrelated popups.
 *
 * `onRunningChange(bool)` bubbles the "running" stage up to RobotSimulator.jsx,
 * which is what actually gates navigation away (the back button, view tabs,
 * popstate/beforeunload guards — see that file). This component only ever
 * decides its own closability; it doesn't touch navigation itself.
 */
export default function ApproachKickTestFlow({ isOpen, onClose, sources, physics, onRunningChange }) {
  const reduceMotion = useReducedMotion();
  const [stage, setStage] = useState("setup");
  const [radiusInput, setRadiusInput] = useState("2.0");
  const [ballXInput, setBallXInput] = useState("");
  const [ballYInput, setBallYInput] = useState("");
  // Off by default -- SimHost's ground-truth ball tracking, so the sweep
  // measures pure approach/kick timing with no vision noise unless asked
  // for. Flipping this on switches the robot onto the same 120°-cone
  // FOV/range/confidence/jitter model the run step's "Limit Ball Vision"
  // pill switches on, at a user-set intensity (see approachKickTest.js).
  const [jitterEnabled, setJitterEnabled] = useState(false);
  const [jitterIntensity, setJitterIntensity] = useState(DEFAULT_PHYSICS.ballJitterIntensity);
  const [formError, setFormError] = useState(null);
  const [progress, setProgress] = useState({ completed: 0, total: TOTAL_RUNS });
  const [testResult, setTestResult] = useState(null); // { report } on failure
  const [runOutput, setRunOutput] = useState(null); // { testName, generatedAt, radiusM, ballX, ballY, repeats, physicsSnapshot, results }
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);

  // Reset to a fresh setup form every time the modal is closed, so reopening
  // the tile always starts a new test rather than resuming a stale one.
  useEffect(() => {
    if (!isOpen) {
      setStage("setup");
      setFormError(null);
      setTestResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const closable = stage !== "running";

  const handleClose = () => {
    if (!closable) return;
    onClose();
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    const radiusM = Number(radiusInput);
    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      setFormError("Enter a distance greater than 0.");
      return;
    }
    const ballX = ballXInput.trim() === "" ? 0 : Number(ballXInput);
    const ballY = ballYInput.trim() === "" ? 0 : Number(ballYInput);
    if (!Number.isFinite(ballX) || !Number.isFinite(ballY)) {
      setFormError("Ball position must be numeric.");
      return;
    }
    setFormError(null);

    // The drawer's own ballJitterIntensity only takes effect once jitter is
    // engaged (see approachKickTest.js's usePreciseBall switch) -- override
    // it with this form's own value so a physics snapshot with jitter off
    // reports 0 rather than silently carrying the drawer's separate setting.
    const physicsSnapshot = { ...physics, ballJitterIntensity: jitterEnabled ? jitterIntensity : 0 };
    setProgress({ completed: 0, total: TOTAL_RUNS });
    setStage("running");
    onRunningChange(true);

    const result = await runApproachKickTest({
      sources,
      physicsSnapshot,
      radiusM,
      ballX,
      ballY,
      jitterEnabled,
      onProgress: (completed, total) => setProgress({ completed, total }),
    });

    onRunningChange(false);

    if (!result.ok) {
      setTestResult(result);
      setStage("error");
      return;
    }

    setRunOutput({
      testName: "Approach & Kick Time",
      generatedAt: formatTimestamp(new Date()),
      radiusM,
      ballX,
      ballY,
      repeats: 3,
      physicsSnapshot,
      results: result.results,
    });
    setStage("results");
  };

  const handleDownloadPdf = () => {
    if (!runOutput) return;
    const doc = buildApproachKickPdf(runOutput);
    doc.save(`approach-kick-time-${Date.now()}.pdf`);
  };

  const jsonText = runOutput ? JSON.stringify(buildResultsJson(runOutput), null, 2) : "";

  const handleCopyJson = () => {
    if (!jsonText) return;
    navigator.clipboard.writeText(jsonText).then(() => {
      setCopied(true);
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = window.setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleDownloadJson = () => {
    if (!jsonText) return;
    const blob = new Blob([jsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `approach-kick-time-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={handleClose}
      closable={closable}
      ariaLabel="Approach & Kick Time test"
      className="akt-modal"
    >
      {closable ? (
        <button type="button" className="test-card-modal-close" aria-label="Close" onClick={handleClose}>
          <X aria-hidden="true" />
        </button>
      ) : null}

      <h3 className="test-card-modal-title">Approach &amp; Kick Time</h3>

      {stage === "setup" ? (
        <form className="akt-form" onSubmit={handleSubmit}>
          <p className="test-card-modal-sm">
            Sweeps 36 approach angles around the ball at 10° intervals, 3 repeats each
            (108 runs), timing every run from the state machine's own chase/adjust →
            kick/cross transition.
          </p>

          <label className="akt-field">
            <span className="akt-field-label">Distance from ball (m)</span>
            <input
              type="number"
              className="akt-field-input"
              min="0.1"
              step="0.1"
              value={radiusInput}
              onChange={(evt) => setRadiusInput(evt.target.value)}
              placeholder="e.g. 2.0"
            />
          </label>

          <div className="akt-field-row">
            <label className="akt-field">
              <span className="akt-field-label">Ball position — x (m)</span>
              <input
                type="number"
                className="akt-field-input"
                step="0.1"
                value={ballXInput}
                onChange={(evt) => setBallXInput(evt.target.value)}
                placeholder="0"
              />
            </label>
            <label className="akt-field">
              <span className="akt-field-label">Ball position — y (m)</span>
              <input
                type="number"
                className="akt-field-input"
                step="0.1"
                value={ballYInput}
                onChange={(evt) => setBallYInput(evt.target.value)}
                placeholder="0"
              />
            </label>
          </div>

          <div className="akt-jitter">
            <div className="akt-jitter-toggle-row">
              <span className="akt-field-label">Ball jitter</span>
              <GlassSwitch checked={jitterEnabled} onChange={setJitterEnabled} aria-label="Ball jitter" />
            </div>
            <p className="akt-jitter-hint">
              Adds perceived-ball position noise and limits the robot to its real 120° field
              of vision, the same model the run step&apos;s &quot;Limit Ball Vision&quot; control
              switches on.
            </p>

            <AnimatePresence initial={false}>
              {jitterEnabled ? (
                <motion.div
                  key="jitter-slider"
                  className="akt-jitter-slider-wrap"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: JITTER_BOX_DURATION, ease: JITTER_BOX_EASE }
                  }
                >
                  <label className="akt-field akt-jitter-slider">
                    <span className="akt-field-label">
                      {JITTER_SLIDER.label}
                      <em>
                        {jitterIntensity.toFixed(2)}
                        {JITTER_SLIDER.unit}
                      </em>
                    </span>
                    <input
                      type="range"
                      min={JITTER_SLIDER.min}
                      max={JITTER_SLIDER.max}
                      step={JITTER_SLIDER.step}
                      value={jitterIntensity}
                      onChange={(evt) => setJitterIntensity(Number(evt.target.value))}
                    />
                    <span className="akt-jitter-note">{JITTER_SLIDER.note}</span>
                  </label>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {formError ? <Notice tone="error" title={formError} /> : null}

          <GlassButton variant="accent" type="submit" className="akt-submit">
            Run test
          </GlassButton>
        </form>
      ) : null}

      {stage === "running" ? (
        <div className="akt-running">
          <ProgressBar
            value={progress.completed}
            max={progress.total}
            label="Testing"
            hint={`${progress.completed}/${progress.total}`}
          />
          <Notice tone="muted" title="Test in progress">
            Do not navigate away from this page or close this tab until the test finishes —
            all 108 runs must complete before you can leave.
          </Notice>
        </div>
      ) : null}

      {stage === "error" ? (
        <Notice tone="error" title="Striker program isn't ready">
          The striker behaviour tree hasn't been fully loaded and checked yet — go back to
          the editor, select Striker, and run Load &amp; Check before starting this test.
        </Notice>
      ) : null}

      {stage === "results" && runOutput ? (
        <div className="akt-results">
          <p className="test-card-modal-sm">
            {TOTAL_RUNS} runs complete across {runOutput.results.length} angles.
          </p>

          <GlassButton variant="glass" onClick={handleDownloadPdf}>
            Download PDF report
          </GlassButton>

          <div className="akt-json-wrap">
            <div className="akt-json-header">
              <span className="akt-field-label">Structured results (JSON)</span>
              <div className="akt-json-actions">
                <button type="button" className="akt-copy-btn" onClick={handleCopyJson}>
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button type="button" className="akt-copy-btn" onClick={handleDownloadJson}>
                  Download .json
                </button>
              </div>
            </div>
            <pre className="akt-json-block">{jsonText}</pre>
          </div>
        </div>
      ) : null}
    </GlassModal>
  );
}
