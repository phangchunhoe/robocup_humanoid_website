// Shared by every magnetic-droplet glass control on the app (GlassButton,
// and the run step's own back button / legend, which use it directly rather
// than through GlassButton — see CLAUDE.md -> Motion -> Spring-based
// controls). Reads how close the pointer is to `el`'s (extended) detection
// zone and writes the lean straight into that control's own motion values,
// or zeroes them once the pointer leaves the zone. Kept out of React state
// for the same reason RoleToggle's cursor highlight writes to custom
// properties instead of setState — this runs on every `mousemove`, and a
// re-render per frame of a pointer sweep would be wasted work no control
// needs.
export const clampMagnitude = (v, max) => Math.min(max, Math.max(-max, v));

export function applyMagneticPull(el, evt, reachPx, pullPx, strength, motionX, motionY) {
  if (!el) return;
  const box = el.getBoundingClientRect();
  const withinZone =
    evt.clientX >= box.left - reachPx &&
    evt.clientX <= box.right + reachPx &&
    evt.clientY >= box.top - reachPx &&
    evt.clientY <= box.bottom + reachPx;
  if (!withinZone) {
    motionX.set(0);
    motionY.set(0);
    return;
  }
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  motionX.set(clampMagnitude((evt.clientX - cx) * strength, pullPx));
  motionY.set(clampMagnitude((evt.clientY - cy) * strength, pullPx));
}
