import { useCallback, useRef } from "react";

/**
 * Pointer-drag handling for an SVG handle, generalized from the clientToField pattern
 * RobotSimulator.jsx and LongRangePreview.jsx each use for their own field drags.
 *
 * `svgRef` is the enclosing <svg>; `toLocal(x, y)` converts SVG user-space coordinates
 * (after CTM inversion, so already accounting for viewBox scaling) into whatever
 * coordinate space the caller wants (field metres, a 0..1 domain, ...). Spread the
 * returned handlers onto the draggable element itself.
 */
export function useDraggablePoint(svgRef, toLocal, onChange) {
  const dragging = useRef(false);

  const toPoint = useCallback(
    (evt) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const local = pt.matrixTransform(svg.getScreenCTM().inverse());
      return toLocal(local.x, local.y);
    },
    [svgRef, toLocal]
  );

  const onPointerDown = useCallback(
    (evt) => {
      evt.preventDefault();
      evt.currentTarget.setPointerCapture(evt.pointerId);
      dragging.current = true;
      const p = toPoint(evt);
      if (p) onChange(p);
    },
    [toPoint, onChange]
  );

  const onPointerMove = useCallback(
    (evt) => {
      if (!dragging.current) return;
      const p = toPoint(evt);
      if (p) onChange(p);
    },
    [toPoint, onChange]
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
