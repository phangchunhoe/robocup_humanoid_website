import { useCallback, useEffect, useRef } from "react";
import "./DotLoader.css";

const cx = (...classes) => classes.filter(Boolean).join(" ");

/**
 * A 7x7 dot-matrix loader that steps through `frames` — each frame an array
 * of the dot indices (0-48) that should be lit. Frame playback is driven by
 * a plain interval toggling classList rather than React state, so a fast
 * frame rate never triggers a re-render.
 *
 * Ported from a shadcn/Tailwind reference component to this project's plain
 * CSS/token system — no Tailwind or TypeScript in this codebase (see
 * CLAUDE.md), so classes come from DotLoader.css and props are untyped.
 */
export default function DotLoader({
  frames,
  isPlaying = true,
  duration = 100,
  dotClassName,
  className,
  repeatCount = -1,
  onComplete,
  ...props
}) {
  const gridRef = useRef(null);
  const currentIndex = useRef(0);
  const repeats = useRef(0);
  const interval = useRef(null);

  const applyFrameToDots = useCallback(
    (dots, frameIndex) => {
      const frame = frames[frameIndex];
      if (!frame) return;
      dots.forEach((dot, index) => {
        dot.classList.toggle("is-active", frame.includes(index));
      });
    },
    [frames]
  );

  useEffect(() => {
    currentIndex.current = 0;
    repeats.current = 0;
  }, [frames]);

  useEffect(() => {
    if (isPlaying) {
      if (currentIndex.current >= frames.length) {
        currentIndex.current = 0;
      }
      const dotElements = gridRef.current?.children;
      if (!dotElements) return undefined;
      const dots = Array.from(dotElements);
      interval.current = setInterval(() => {
        applyFrameToDots(dots, currentIndex.current);
        if (currentIndex.current + 1 >= frames.length) {
          if (repeatCount !== -1 && repeats.current + 1 >= repeatCount) {
            clearInterval(interval.current);
            onComplete?.();
          }
          repeats.current++;
        }
        currentIndex.current = (currentIndex.current + 1) % frames.length;
      }, duration);
    } else {
      if (interval.current) clearInterval(interval.current);
      // Reduced-motion callers pass isPlaying={false}: hold a single still
      // frame rather than leaving every dot unlit, the same "freeze on a
      // resting frame" fallback the physics drawer's scrub uses.
      const dotElements = gridRef.current?.children;
      if (dotElements) applyFrameToDots(Array.from(dotElements), 0);
    }

    return () => {
      if (interval.current) clearInterval(interval.current);
    };
  }, [frames, isPlaying, applyFrameToDots, duration, repeatCount, onComplete]);

  return (
    <div {...props} ref={gridRef} className={cx("dot-loader", className)}>
      {Array.from({ length: 49 }).map((_, i) => (
        <div key={i} className={cx("dot-loader-dot", dotClassName)} />
      ))}
    </div>
  );
}
