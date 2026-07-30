import { useEffect } from "react";
import Header from "../components/Header.jsx";
import "./BezierAnatomy.css";

const CONTENT_HTML = `
<div class="sheet">

  <header class="titleblock">
    <div>
      <h1>Bézier Chase-Path — Anatomy &amp; Activation</h1>
      <p class="dek">How <code>StrikerChase</code> curves in behind the ball, when it skips the curve
        entirely and drives straight instead, and what each of the four control points is actually
        doing.</p>
    </div>
    <dl class="tb-meta">
      <div><dt>Source</dt><dd>brain_tree.cpp:1296–1516</dd></div>
      <div><dt>Node</dt><dd>StrikerChase</dd></div>
      <div><dt>Scale</dt><dd>illustrative, not to field scale</dd></div>
    </dl>
  </header>

  <section class="intro">
    <p>The curve only ever has one job: get the robot from wherever it is now (<b class="p0 mono">P0</b>)
      to a stand-off spot just behind the ball (<b class="p3 mono">P3</b>), arriving already pointed the
      way it needs to kick — no stop-and-spin once it gets there. Whether that trip is a straight line or
      a swooping arc depends entirely on how far off-angle the robot currently is, and how far away the
      stand-off spot is.</p>
    <p>The four figures below walk through the anatomy of the curve, the two cases where the ball sits
      roughly in front of the robot versus off to the side or behind it, and the distance cutoff that
      decides whether any of this runs at all.</p>
  </section>

  <!-- FIGURE 1: ANATOMY -->
  <figure class="panel">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 1</span>
      <h2>Anatomy of the curve</h2>
    </div>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Diagram of a cubic Bezier curve from the robot position P0 through control points P1 and P2 to the behind-ball target P3">
        <defs>
          <marker id="a1-kick" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--kick)"/>
          </marker>
          <marker id="a1-curve" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--curve)"/>
          </marker>
        </defs>

        <!-- kick direction -->
        <line x1="470" y1="170" x2="586" y2="170" stroke="var(--kick)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" marker-end="url(#a1-kick)"/>
        <text x="500" y="158" class="mono" font-size="12" fill="var(--kick)">kick direction</text>

        <!-- ball -->
        <circle cx="470" cy="170" r="10" fill="var(--kick)"/>
        <text x="470" y="196" text-anchor="middle" class="mono" font-size="12" fill="var(--ink-soft)">ball</text>

        <!-- handle guide lines -->
        <line x1="150" y1="90" x2="260" y2="165" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>
        <line x1="350" y1="205" x2="230" y2="230" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>

        <!-- bezier curve P0 150,90 -> P1 260,165 -> P2 230,230 -> P3 350,205 -->
        <path d="M150,90 C260,165 230,230 350,205" fill="none" stroke="var(--curve)" stroke-width="3" marker-end="url(#a1-curve)"/>

        <!-- lookahead marker -->
        <circle cx="226" cy="162" r="5" fill="var(--curve)"/>
        <text x="236" y="150" class="mono" font-size="11.5" fill="var(--curve)">steering target</text>
        <text x="236" y="164" class="mono" font-size="11.5" fill="var(--curve)">(~0.25 m ahead)</text>

        <!-- P0 robot -->
        <g transform="translate(150,90) rotate(40)">
          <path d="M-9,-8 L14,0 L-9,8 z" fill="var(--ink)"/>
        </g>
        <text x="120" y="72" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0</text>
        <text x="93" y="87" class="mono" font-size="11" fill="var(--ink-soft)">robot now</text>

        <!-- P1 -->
        <circle cx="260" cy="165" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="270" y="180" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P1</text>
        <text x="270" y="193" class="mono" font-size="11" fill="var(--ink-soft)">departure handle</text>

        <!-- P2 -->
        <circle cx="230" cy="230" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="178" y="252" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P2</text>
        <text x="140" y="265" class="mono" font-size="11" fill="var(--ink-soft)">arrival handle</text>

        <!-- P3 -->
        <g transform="translate(350,205) rotate(45)">
          <rect x="-7" y="-7" width="14" height="14" fill="var(--panel)" stroke="var(--kick)" stroke-width="2.2"/>
        </g>
        <text x="362" y="222" class="mono" font-size="13" font-weight="700" fill="var(--kick)">P3</text>
        <text x="362" y="235" class="mono" font-size="11" fill="var(--ink-soft)">behind-ball target</text>
      </svg>
    </div>
    <ul class="legend">
      <li><span class="dot p0"></span><span><span class="label p0">P0</span><span class="desc">robot's position this tick</span></span></li>
      <li><span class="dot p1"></span><span><span class="label p1">P1</span><span class="desc">stretched out along the robot's current facing, so the curve leaves smoothly</span></span></li>
      <li><span class="dot p2"></span><span><span class="label p2">P2</span><span class="desc">pulled back from P3 along the kick direction, so the curve arrives already aimed right</span></span></li>
      <li><span class="dot p3"></span><span><span class="label p3">P3</span><span class="desc">the stand-off point behind the ball — not the ball itself</span></span></li>
    </ul>
    <figcaption>Recomputed from scratch every tick — nothing here is a stored path. The robot only ever
      steers toward a point <span class="cond">~0.25 m</span> further along the freshly-drawn curve, like
      chasing a moving carrot rather than committing to a fixed route.</figcaption>
  </figure>

  <!-- FIGURE 2: BALL IN FRONT -->
  <figure class="panel">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 2</span>
      <h2>Ball in front — already lined up</h2>
    </div>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 220" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Diagram showing the robot already behind the ball on the kick line, walking straight to the target with no curve">
        <defs>
          <marker id="a2-kick" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--kick)"/>
          </marker>
          <marker id="a2-curve" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--curve)"/>
          </marker>
        </defs>

        <line x1="460" y1="150" x2="586" y2="150" stroke="var(--kick)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" marker-end="url(#a2-kick)"/>
        <text x="486" y="138" class="mono" font-size="12" fill="var(--kick)">kick direction</text>

        <circle cx="460" cy="150" r="10" fill="var(--kick)"/>
        <text x="460" y="176" text-anchor="middle" class="mono" font-size="12" fill="var(--ink-soft)">ball</text>

        <!-- straight path, same line as kick direction: robot already behind ball -->
        <line x1="120" y1="150" x2="380" y2="150" stroke="var(--curve)" stroke-width="3" marker-end="url(#a2-curve)"/>

        <g transform="translate(120,150) rotate(0)">
          <path d="M-9,-8 L14,0 L-9,8 z" fill="var(--ink)"/>
        </g>
        <text x="95" y="130" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0</text>

        <g transform="translate(380,150) rotate(0)">
          <rect x="-7" y="-7" width="14" height="14" fill="var(--panel)" stroke="var(--kick)" stroke-width="2.2" transform="rotate(45)"/>
        </g>
        <text x="380" y="132" text-anchor="middle" class="mono" font-size="13" font-weight="700" fill="var(--kick)">P3</text>
      </svg>
    </div>
    <figcaption>Robot, ball and the kick line all sit on one axis — <span class="cond">angDiff &lt; 60°</span>
      and the straight line clears the ball by <span class="cond">≥ 0.30 m</span>, so
      <span class="cond">target_type = direct</span>. Within <span class="cond">15°</span> of both the
      ball bearing and the kick direction, it's a <span class="cond">straight_bypass</span> instead — same
      result, walk straight to P3. Either way the curve math never runs.</figcaption>
  </figure>

  <!-- FIGURE 3: BALL BEHIND -->
  <figure class="panel">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 3</span>
      <h2>Ball behind the robot's heading — full swing</h2>
    </div>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 300" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Diagram showing the robot facing away from the required kick line, taking a wide Bezier arc around to arrive behind the ball">
        <defs>
          <marker id="a3-kick" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--kick)"/>
          </marker>
          <marker id="a3-curve" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--curve)"/>
          </marker>
        </defs>

        <line x1="430" y1="150" x2="560" y2="150" stroke="var(--kick)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" marker-end="url(#a3-kick)"/>
        <text x="456" y="138" class="mono" font-size="12" fill="var(--kick)">kick direction</text>

        <circle cx="430" cy="150" r="10" fill="var(--kick)"/>
        <text x="430" y="176" text-anchor="middle" class="mono" font-size="12" fill="var(--ink-soft)">ball</text>

        <!-- handle guide lines -->
        <line x1="470" y1="90" x2="560" y2="40" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>
        <line x1="330" y1="190" x2="250" y2="260" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>

        <!-- bezier: P0 470,90 -> P1 560,40 -> P2 250,260 -> P3 330,190 -->
        <path d="M470,90 C560,40 250,260 330,190" fill="none" stroke="var(--curve)" stroke-width="3" marker-end="url(#a3-curve)"/>

        <!-- lookahead marker -->
        <circle cx="437" cy="124" r="5" fill="var(--curve)"/>
        <text x="447" y="115" class="mono" font-size="11.5" fill="var(--curve)">steering target</text>

        <!-- P0 robot, facing up-right (away from kick line) -->
        <g transform="translate(470,90) rotate(-25)">
          <path d="M-9,-8 L14,0 L-9,8 z" fill="var(--ink)"/>
        </g>
        <text x="480" y="72" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0</text>
        <text x="480" y="86" class="mono" font-size="11" fill="var(--ink-soft)">facing away</text>

        <circle cx="560" cy="40" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="568" y="30" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P1</text>

        <circle cx="250" cy="260" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="200" y="280" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P2</text>

        <g transform="translate(330,190) rotate(45)">
          <rect x="-7" y="-7" width="14" height="14" fill="var(--panel)" stroke="var(--kick)" stroke-width="2.2"/>
        </g>
        <text x="342" y="208" class="mono" font-size="13" font-weight="700" fill="var(--kick)">P3</text>
      </svg>
    </div>
    <figcaption>Robot is on the wrong side of the ball and facing away from the kick line —
      <span class="cond">angDiff</span> is closing in on 180°. <span class="cond">dynamicOffsetDist</span>
      stretches out toward 0.65 m and <span class="cond">blendFactor</span> climbs toward its cap
      (<span class="cond">MAX_BLEND = 0.6</span>, capped at <span class="cond">1.2 m</span>): the worse
      the misalignment, the further P1/P2 get pushed out and the wider the arc has to swing.</figcaption>
  </figure>

  <!-- FIGURE 4: ACTIVATION DISTANCE -->
  <figure class="panel">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 4</span>
      <h2>When it activates: distance, not angle</h2>
    </div>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 320" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Diagram showing a dashed activation radius around the behind-ball target: a nearby robot takes the curved path, a distant robot drives straight and turns in place instead">
        <defs>
          <marker id="a4-kick" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--kick)"/>
          </marker>
          <marker id="a4-curve" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--curve)"/>
          </marker>
        </defs>

        <!-- activation radius -->
        <circle cx="380" cy="160" r="150" fill="none" stroke="var(--mute)" stroke-width="1.6" stroke-dasharray="6 6"/>
        <text x="380" y="4" text-anchor="middle" class="mono" font-size="11.5" fill="var(--mute)">activation radius · 1.5 m</text>

        <line x1="460" y1="160" x2="580" y2="160" stroke="var(--kick)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" marker-end="url(#a4-kick)"/>
        <text x="486" y="148" class="mono" font-size="12" fill="var(--kick)">kick direction</text>

        <circle cx="460" cy="160" r="10" fill="var(--kick)"/>
        <text x="460" y="186" text-anchor="middle" class="mono" font-size="12" fill="var(--ink-soft)">ball</text>

        <g transform="translate(380,160) rotate(45)">
          <rect x="-7" y="-7" width="14" height="14" fill="var(--panel)" stroke="var(--kick)" stroke-width="2.2"/>
        </g>
        <text x="392" y="178" class="mono" font-size="13" font-weight="700" fill="var(--kick)">P3</text>

        <!-- near robot: inside radius, curved path -->
        <path d="M300,230 C340,255 400,195 380,160" fill="none" stroke="var(--curve)" stroke-width="3" marker-end="url(#a4-curve)"/>
        <g transform="translate(300,230) rotate(-40)">
          <path d="M-9,-8 L14,0 L-9,8 z" fill="var(--ink)"/>
        </g>
        <text x="255" y="222" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0 (near)</text>
        <text x="240" y="250" class="mono" font-size="11.5" fill="var(--curve)">inside 1.5 m → curve active</text>

        <!-- far robot: outside radius, straight dashed + turn glyph -->
        <line x1="90" y1="270" x2="380" y2="160" stroke="var(--mute)" stroke-width="2.4" stroke-dasharray="7 6"/>
        <g transform="translate(90,270) rotate(-20)">
          <path d="M-9,-8 L14,0 L-9,8 z" fill="var(--ink)"/>
        </g>
        <path d="M55,240 A20,20 0 1 1 50,258" fill="none" stroke="var(--mute)" stroke-width="2" marker-end="url(#a4-curve)"/>
        <text x="30" y="222" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0 (far)</text>
        <text x="20" y="296" class="mono" font-size="11.5" fill="var(--mute)">beyond 1.5 m → curve skipped, turns hard while walking straight</text>
      </svg>
    </div>
    <div class="spec-strip">
      <span>BEZIER_ACTIVATION_DIST = <b>1.5 m</b></span>
      <span>MAX_BLEND_CAP = <b>1.2 m</b></span>
      <span>lookahead = <b>0.25 m</b></span>
      <span>vtheta while far = <b>targetDir × 1.4</b></span>
    </div>
    <figcaption>Distance from P0 to P3 is measured fresh every tick. Above the cutoff, sweeping a full arc
      from far away would be slow for no benefit — so the robot just turns hard and drives straight,
      leaving the curve for the final stretch where the approach angle actually matters.</figcaption>
  </figure>

  <!-- FIGURE 5: BALL "IN FRONT" BUT POSITIONALLY OFFSET -->
  <figure class="panel">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 5</span>
      <h2>Ball dead ahead, but 80° off the kick line</h2>
    </div>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Diagram showing the robot facing directly at the ball, which is visually in front of it, yet positionally 80 degrees off the kick line, so the curve activates early and peels away from the straight line to the ball">
        <defs>
          <marker id="a5-kick" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--kick)"/>
          </marker>
          <marker id="a5-curve" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--curve)"/>
          </marker>
        </defs>

        <line x1="460" y1="90" x2="610" y2="90" stroke="var(--kick)" stroke-width="2" stroke-dasharray="1 6" stroke-linecap="round" marker-end="url(#a5-kick)"/>
        <text x="486" y="78" class="mono" font-size="12" fill="var(--kick)">kick direction</text>

        <circle cx="460" cy="90" r="10" fill="var(--kick)"/>
        <text x="460" y="116" text-anchor="middle" class="mono" font-size="12" fill="var(--ink-soft)">ball</text>

        <!-- dotted sightline showing the ball is dead ahead of the robot's heading -->
        <line x1="411" y1="366" x2="460" y2="90" stroke="var(--ink-soft)" stroke-width="1" stroke-dasharray="1 5"/>
        <text x="330" y="230" class="mono" font-size="11" fill="var(--ink-soft)">ball is visually "in front" —</text>
        <text x="330" y="244" class="mono" font-size="11" fill="var(--ink-soft)">robot is looking straight at it</text>

        <!-- handle guide lines -->
        <line x1="411" y1="366" x2="420" y2="319" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>
        <line x1="427" y1="62" x2="380" y2="62" stroke="var(--ink-soft)" stroke-width="1.2" stroke-dasharray="3 4"/>

        <!-- bezier: P0 411,366 -> P1 420,319 -> P2 380,62 -> P3 427,62 -->
        <path d="M411,366 C420,319 380,62 427,62" fill="none" stroke="var(--curve)" stroke-width="3" marker-end="url(#a5-curve)"/>

        <!-- lookahead marker, ~0.4m along the curve -->
        <circle cx="412" cy="332" r="5" fill="var(--curve)"/>
        <text x="422" y="336" class="mono" font-size="11.5" fill="var(--curve)">steering target</text>
        <text x="422" y="349" class="mono" font-size="11.5" fill="var(--curve)">already peeling left</text>

        <!-- P0 robot, heading -80° in SVG space = 80° field heading, i.e. facing the ball -->
        <g transform="translate(411,366) rotate(-80)">
          <path d="M14,0 L-9,-8 L-9,8 z" fill="var(--ink)"/>
        </g>
        <text x="418" y="392" class="mono" font-size="13" font-weight="700" fill="var(--ink)">P0</text>
        <text x="418" y="405" class="mono" font-size="11" fill="var(--ink-soft)">facing the ball</text>

        <circle cx="420" cy="319" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="430" y="310" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P1</text>

        <circle cx="380" cy="62" r="5.5" fill="var(--panel)" stroke="var(--curve)" stroke-width="2"/>
        <text x="330" y="45" class="mono" font-size="13" font-weight="700" fill="var(--curve)">P2</text>

        <g transform="translate(427,62) rotate(45)">
          <rect x="-7" y="-7" width="14" height="14" fill="var(--panel)" stroke="var(--kick)" stroke-width="2.2"/>
        </g>
        <text x="440" y="50" class="mono" font-size="13" font-weight="700" fill="var(--kick)">P3</text>
      </svg>
    </div>
    <figcaption>Robot sits ~3.8 m from the ball, heading angle pointed almost exactly at it — by any
      heading-based read, the ball is "in front." But positionally the robot is <span class="cond">80°</span>
      off the line it needs to be on (well past the <span class="cond">60° DIRECT_THRESHOLD</span>), so
      circle-back fires regardless of where the robot is looking. Because P1 (departure) follows the
      robot's actual heading — straight at the ball — while P2 (arrival) is anchored to the kick direction,
      the curve doesn't wait until it's close to correct course: it hooks left almost immediately, so by
      the time the robot is halfway there it's already tracking toward the correct approach line instead
      of walking straight at the ball and swinging late.</figcaption>
  </figure>

  <footer class="tb-footer">Illustrative diagram — geometry simplified for clarity, not a literal
    render of any one logged tick.</footer>

</div>
`;

export default function BezierAnatomy() {
  useEffect(() => {
    document.title = "Bézier Chase-Path — Anatomy & Activation";
  }, []);

  return (
    <>
      <Header />
      <div
        className="anatomy-page"
        // Static, non-interactive markup reproduced verbatim from the original
        // Claude artifact, so it renders pixel-for-pixel identical.
        dangerouslySetInnerHTML={{ __html: CONTENT_HTML }}
      />
    </>
  );
}
