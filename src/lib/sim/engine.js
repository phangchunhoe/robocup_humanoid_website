// Real-time loop: a requestAnimationFrame driver with a fixed-timestep accumulator.
//
// The brain thread in the real robot runs at a fixed 100 Hz (main.cpp:8, `#define HZ 100`),
// so the simulator uses dt = 0.01 s and ticks the brain once per physics step. Display
// refresh rate does not affect the result -- a run at 144 Hz and a run at 60 Hz produce
// identical trajectories.
//
// LongRangePreview.jsx has the only other rAF loop in this repo, but it advances a fixed
// distance per frame (frame-rate dependent). That is fine for a preview animation and wrong
// for physics, hence the accumulator here.

export const FIXED_DT = 0.01; // seconds, = 1 / HZ

// Never simulate more than this many steps in one frame. Without the cap, a slow tick
// (or a backgrounded tab) makes the accumulator grow faster than it drains and the page
// locks up. Exceeding it means we cannot hold real time, which we report rather than hide.
const MAX_STEPS_PER_FRAME = 40;

export function createEngine({ onStep, onRender, onOverrun }) {
  let raf = 0;
  let running = false;
  let lastNow = 0;
  let accumulator = 0;
  let speed = 1;

  // Rolling average of step cost, surfaced in the diagnostics panel.
  let stepCostMs = 0;
  let steps = 0;

  function frame(now) {
    if (!running) return;
    const elapsed = Math.min((now - lastNow) / 1000, 0.25); // ignore >250 ms gaps
    lastNow = now;
    accumulator += elapsed * speed;

    let n = 0;
    const t0 = performance.now();
    while (accumulator >= FIXED_DT && n < MAX_STEPS_PER_FRAME) {
      onStep(FIXED_DT);
      accumulator -= FIXED_DT;
      n += 1;
    }
    if (n > 0) {
      const cost = (performance.now() - t0) / n;
      stepCostMs = stepCostMs === 0 ? cost : stepCostMs * 0.9 + cost * 0.1;
      steps += n;
    }
    if (accumulator >= FIXED_DT) {
      // Could not drain the accumulator: we are behind real time. Drop the backlog
      // rather than accruing an unpayable debt, and say so.
      accumulator = 0;
      if (onOverrun) onOverrun(stepCostMs);
    }

    onRender();
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      lastNow = performance.now();
      accumulator = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    /** Advance exactly one brain tick while paused. */
    stepOnce() {
      const t0 = performance.now();
      onStep(FIXED_DT);
      stepCostMs = performance.now() - t0;
      steps += 1;
      onRender();
    },
    setSpeed(v) {
      speed = v;
    },
    isRunning() {
      return running;
    },
    /** The live accumulator value, in seconds — for the Simulation Math page's own
     *  visualization of this loop. Nothing in the real run step reads this. */
    getAccumulator() {
      return accumulator;
    },
    stats() {
      return { stepCostMs, steps };
    },
    resetStats() {
      stepCostMs = 0;
      steps = 0;
    },
  };
}
