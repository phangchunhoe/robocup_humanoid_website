import SimMathSection from "../SimMathSection.jsx";
import FormulaBlock from "../../FormulaBlock.jsx";
import AffineTransformViz from "../misc/AffineTransformViz.jsx";

export default function FieldSvgMappingSection() {
  return (
    <SimMathSection
      id="field-svg-mapping"
      number={7}
      title="Field ↔ SVG coordinate mapping"
      intro="Shared pitch geometry and the affine transform that turns a field position in metres into an on-screen SVG position in pixels."
    >
      <FormulaBlock
        id="to-svg"
        eyebrow="src/lib/sim/field.js"
        title="Affine transform"
        formula="\text{toSvg}(x,y) = \big((x+7.5)\cdot 60,\ \ (5-y)\cdot 60\big)"
        variables={[
          { symbol: "x, y", meaning: "A position in field metres, origin at the centre circle." },
          { symbol: "7.5, 5", meaning: "Half the visible view's width/height in metres — re-centres the origin to the canvas's top-left corner." },
          { symbol: "60", meaning: "The pixels-per-metre scale — the whole 900×600 SVG viewport is exactly 15m × 10m at this scale." },
        ]}
        points={[
          "Two independent one-dimensional shifts-and-scales, one per axis — nothing rotates, so this is simpler than the robot-frame transform back in Section 1.",
          "Adding 7.5 to x before scaling moves the field's centre-circle origin over to the left edge of the canvas, where SVG's own coordinate origin sits.",
          "The y-axis gets flipped as well as shifted: SVG pixels count downward from the top, but the field's own +y points left/up, so this has to subtract y from 5 rather than add it.",
          "Because the scale (60 px/m) is the same on both axes, distances and angles on the field are preserved on screen — nothing gets stretched or skewed, only shifted and mirrored.",
        ]}
        viz={<AffineTransformViz />}
      />
    </SimMathSection>
  );
}
