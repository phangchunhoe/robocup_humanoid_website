import { useEffect, useRef } from "react";
import Header from "../components/Header.jsx";
import teamCommSpecText from "../content/teamCommSpecText.js";
import "./TeamCommByteFormat.css";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Byte 0..15 category coloring for the packet-at-a-glance strip. `anchor`
// must match the id of whichever section actually documents that byte —
// several bytes (2-4, 5-6, 7-12, 14-15) share one grouped section rather
// than having a per-byte id, so this cannot simply be derived from idx.
const BYTE_CATEGORIES = [
  { idx: 0, name: "PW", var: "pw", full: "password", anchor: "byte0" },
  { idx: 1, name: "IDENTITY", var: "id", full: "identity", anchor: "byte1" },
  { idx: 2, name: "Z1 / Z2", var: "zone", full: "robot zones", anchor: "zone-bytes" },
  { idx: 3, name: "Z3 + B1", var: "zone", full: "robot zone / ball zone", anchor: "zone-bytes" },
  { idx: 4, name: "B2 / B3", var: "zone", full: "ball zones", anchor: "zone-bytes" },
  { idx: 5, name: "C1 / C2", var: "conf", full: "ball confidence", anchor: "conf-bytes" },
  { idx: 6, name: "C3 + FBZ", var: "conf", full: "confidence / final ball zone", anchor: "conf-bytes" },
  { idx: 7, name: "CHASE 1", var: "chase", full: "chase score", anchor: "score-bytes" },
  { idx: 8, name: "CHASE 2", var: "chase", full: "chase score", anchor: "score-bytes" },
  { idx: 9, name: "CHASE 3", var: "chase", full: "chase score", anchor: "score-bytes" },
  { idx: 10, name: "GOALIE 1", var: "goalie", full: "goalie score", anchor: "score-bytes" },
  { idx: 11, name: "GOALIE 2", var: "goalie", full: "goalie score", anchor: "score-bytes" },
  { idx: 12, name: "GOALIE 3", var: "goalie", full: "goalie score", anchor: "score-bytes" },
  { idx: 13, name: "SWITCH", var: "switch", full: "role-switch control", anchor: "byte13" },
  { idx: 14, name: "BALL X", var: "ball", full: "quantized ball x", anchor: "ball-xy" },
  { idx: 15, name: "BALL Y", var: "ball", full: "quantized ball y", anchor: "ball-xy" },
];

const byteStripHtml = () =>
  `<div class="byte-strip">` +
  BYTE_CATEGORIES.map(
    (b) =>
      `<a href="#${b.anchor}" class="byte-cell" style="--cell-color:var(--cat-${b.var})" title="byte ${b.idx}: ${b.full}">` +
      `<span class="idx">byte ${b.idx}</span><span class="name">${b.name}</span></a>`
  ).join("") +
  `</div>`;

const byteLegendHtml = () => {
  const cats = [
    ["pw", "password"],
    ["id", "identity"],
    ["zone", "robot / ball zones"],
    ["conf", "confidence"],
    ["chase", "chase score"],
    ["goalie", "goalie score"],
    ["switch", "role-switch"],
    ["ball", "precise ball x/y"],
  ];
  return (
    `<div class="byte-legend">` +
    cats
      .map(
        ([v, label]) =>
          `<span><i class="sw" style="--sw-color:var(--cat-${v})"></i>${label}</span>`
      )
      .join("") +
    `</div>`
  );
};

// Reusable 8-bit register diagram. fields = [{bits:[hi,lo], label, cat}]
// ordered from bit 7 down to bit 0, must fully cover 8 bits.
function bitfieldTableHtml(fields, footerHtml) {
  const head = fields
    .map((f) => {
      const [hi, lo] = f.bits;
      const span = hi - lo + 1;
      const nums = [];
      for (let b = hi; b >= lo; b--) nums.push(b);
      return `<th colspan="${span}">${nums.join(" ")}</th>`;
    })
    .join("");
  const body = fields
    .map((f) => {
      const [hi, lo] = f.bits;
      const span = hi - lo + 1;
      const style = f.cat
        ? ` style="color:var(--cat-${f.cat});background:var(--cat-${f.cat}-soft)"`
        : "";
      return `<td colspan="${span}"${style}>${f.label}</td>`;
    })
    .join("");
  return (
    `<table class="bitfield-table"><thead><tr>${head}</tr></thead>` +
    `<tbody><tr>${body}</tr></tbody>` +
    (footerHtml ? `<tfoot><tr><td colspan="8">${footerHtml}</td></tr></tfoot>` : "") +
    `</table>`
  );
}

const zoneGridHtml = () => {
  const cells = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((n) => `<div class="zone-cell">${n}</div>`)
    .join("");
  return `
    <div class="zone-grid-wrap">
      <span class="zone-axis-label">y positive (top)</span>
      <div class="zone-grid">${cells}</div>
      <div class="zone-cols"><span>own side</span><span>center</span><span>opponent side</span></div>
      <span class="zone-axis-label">y negative (bottom)</span>
    </div>`;
};

function scoreBarHtml(value255, exampleLabel) {
  const pct = (value255 / 255) * 100;
  const score = ((value255 * 100) / 255).toFixed(1);
  return `
    <div class="score-bar-wrap">
      <div class="score-bar"><div class="marker" style="left:${pct}%" data-label="${exampleLabel} = ${value255} → ${score}"></div></div>
      <div class="score-bar-scale"><span>0 (best)</span><span>127</span><span>255 (worst)</span></div>
    </div>`;
}

const CONTENT_HTML = `
<div class="sheet">

  <header class="titleblock">
    <div>
      <h1>Teammate Communication Byte Format</h1>
      <p class="dek">How three robots on the same team squeeze identity, position, ball belief, role
        suitability, and a goalkeeper-handoff handshake into a single fixed <b>16-byte</b> UDP broadcast
        packet — no framing, no length prefix, no legacy fallback. Exactly 16 bytes in, or the packet is
        dropped on the floor.</p>
      <a href="#copy" class="jump-link">↓ Jump to copy-able spec text</a>
    </div>
    <dl class="tb-meta">
      <div><dt>Source</dt><dd>src/robot_communication/src/robot_communication_node.cpp</dd></div>
      <div><dt>ROS out topic</dt><dd>/booster_soccer/team_comm/out</dd></div>
      <div><dt>ROS in topic</dt><dd>/booster_soccer/team_comm/in</dd></div>
      <div><dt>UDP port</dt><dd>10000 + team_id</dd></div>
      <div><dt>Broadcast addr</dt><dd>255.255.255.255</dd></div>
      <div><dt>Password (default)</dt><dd>0xA7 (167)</dd></div>
      <div><dt>TX size</dt><dd>exactly 16 bytes</dd></div>
      <div><dt>RX accepted size</dt><dd>exactly 16 bytes</dd></div>
    </dl>
  </header>

  <section class="intro">
    <p>Every teammate broadcasts the same shape of packet at some send rate, and every teammate decodes
      it the same way. Each packet doesn't just describe the sender — it also carries a short-term cached
      view of the other two players, so hearing from just one teammate is often enough to reconstruct the
      whole team's picture. One byte (13) doubles as a tiny three-way handshake for handing the goalkeeper
      role between robots without ever letting two robots believe they're both the keeper at once.</p>
    <p>The figures below walk byte-by-byte through packing and decoding, the 3×3 field-zone grid every
      position is quantized into, the confidence/score encodings, the role-switch handshake, and finish
      with a fully worked example packet you can check your own decoder against.</p>
  </section>

  <nav class="toc">
    <p class="toc-title">Contents</p>
    <ol>
      <li><a href="#glance">Fig. 1 — Packet at a glance</a></li>
      <li><a href="#byte0">Fig. 2 — Byte 0: password</a></li>
      <li><a href="#byte1">Fig. 3 — Byte 1: identity</a></li>
      <li><a href="#zones">Fig. 4 — The 3×3 zone grid</a></li>
      <li><a href="#zone-bytes">Fig. 5 — Bytes 2–4: zone packing</a></li>
      <li><a href="#conf-bytes">Fig. 6 — Bytes 5–6: confidence + final ball zone</a></li>
      <li><a href="#score-bytes">Fig. 7 — Bytes 7–12: chase &amp; goalie scores</a></li>
      <li><a href="#byte13">Fig. 8 — Byte 13: role-switch control</a></li>
      <li><a href="#handshake">Fig. 9 — The goalie-swap handshake</a></li>
      <li><a href="#ball-xy">Fig. 10 — Bytes 14–15: precise ball position</a></li>
      <li><a href="#validation">Packet validation rules</a></li>
      <li><a href="#cache">Player state cache</a></li>
      <li><a href="#ros-in">Reconstructed ROS message</a></li>
      <li><a href="#lost">Fields lost on the wire</a></li>
      <li><a href="#summary">Complete packing / decoding summary</a></li>
      <li><a href="#example">Fig. 11 — Worked example packet</a></li>
      <li><a href="#copy">Copy the full spec</a></li>
    </ol>
  </nav>

  <!-- FIGURE 1: PACKET AT A GLANCE -->
  <figure class="panel" id="glance">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 1</span>
      <h2>Packet at a glance — all 16 bytes</h2>
    </div>
    <p class="panel-desc">Click any byte to jump to its section. Bytes 2–6 pack two 4-bit fields each;
      every other byte is a single un-split value.</p>
    ${byteStripHtml()}
    ${byteLegendHtml()}
    <figcaption>Index 0 is always the password check; indices 7–12 are always full, unsplit bytes (no
      nibble packing); index 13 is the only byte whose meaning changes based on its own opcode field.</figcaption>
  </figure>

  <section class="panel">
    <div class="panel-head"><h2>Byte index reference</h2></div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Idx</th><th>Name</th><th>Summary</th></tr></thead>
        <tbody>
          <tr><td class="num mono">0</td><td class="mono">password</td><td>Shared compact password / check byte</td></tr>
          <tr><td class="num mono">1</td><td class="mono">identity</td><td>Sender player id, role, alive, lead</td></tr>
          <tr><td class="num mono">2</td><td class="mono">player zones 1 &amp; 2</td><td>Player 1 robot zone, player 2 robot zone</td></tr>
          <tr><td class="num mono">3</td><td class="mono">p3 zone + p1 ball</td><td>Player 3 robot zone, player 1 ball zone</td></tr>
          <tr><td class="num mono">4</td><td class="mono">p2 &amp; p3 ball zones</td><td>Player 2 ball zone, player 3 ball zone</td></tr>
          <tr><td class="num mono">5</td><td class="mono">p1 &amp; p2 confidence</td><td>Player 1 ball confidence, player 2 confidence</td></tr>
          <tr><td class="num mono">6</td><td class="mono">p3 conf + final ball</td><td>Player 3 confidence, final ball zone</td></tr>
          <tr><td class="num mono">7</td><td class="mono">p1 chase score</td><td>Player 1 compact chase score</td></tr>
          <tr><td class="num mono">8</td><td class="mono">p2 chase score</td><td>Player 2 compact chase score</td></tr>
          <tr><td class="num mono">9</td><td class="mono">p3 chase score</td><td>Player 3 compact chase score</td></tr>
          <tr><td class="num mono">10</td><td class="mono">p1 goalie score</td><td>Player 1 compact goalie score</td></tr>
          <tr><td class="num mono">11</td><td class="mono">p2 goalie score</td><td>Player 2 compact goalie score</td></tr>
          <tr><td class="num mono">12</td><td class="mono">p3 goalie score</td><td>Player 3 compact goalie score</td></tr>
          <tr><td class="num mono">13</td><td class="mono">role-switch control</td><td>Opcode, sequence, target, role</td></tr>
          <tr><td class="num mono">14</td><td class="mono">ball x</td><td>Quantized precise ball x position</td></tr>
          <tr><td class="num mono">15</td><td class="mono">ball y</td><td>Quantized precise ball y position</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <div class="callout">
    <strong>No legacy path.</strong> There is no shorter/older format accepted on receive and no longer
    format either — exactly 16 bytes or the packet is rejected as "unexpected packet size". The absolute
    upper bound checked before that comparison even runs is 512 bytes, but in practice only 16 ever passes.
  </div>

  <!-- FIGURE 2: BYTE 0 -->
  <figure class="panel" id="byte0">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 2</span>
      <h2>Byte 0 — password</h2>
      <span class="byte-tag">byte 0</span>
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [{ bits: [7, 0], label: "password (P)", cat: "pw" }],
        "byte0 = compact_secret_password"
      )}
    </div>
    <figcaption>A received packet is rejected outright if byte 0 doesn't match the locally configured
      <span class="cond">compact_secret_password</span> (default <span class="cond">0xA7</span> / 167,
      clamped to 0..255). Cheap misconfiguration guard, not real security — it's a plain equality check
      broadcast in the clear.</figcaption>
  </figure>

  <!-- FIGURE 3: BYTE 1 -->
  <figure class="panel" id="byte1">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 3</span>
      <h2>Byte 1 — identity</h2>
      <span class="byte-tag">byte 1</span>
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 7], label: "lead", cat: "id" },
          { bits: [6, 6], label: "alive", cat: "id" },
          { bits: [5, 4], label: "role", cat: "id" },
          { bits: [3, 0], label: "player_id", cat: "id" },
        ],
        "byte1 = player_id | (role &lt;&lt; 4) | (is_alive ? 0x40 : 0) | (is_lead ? 0x80 : 0)"
      )}
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Field</th><th>Bits</th><th>Mask</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td class="mono">player_id</td><td class="mono">0..3</td><td class="mono">0x0F</td>
            <td>Sender's player ID. Full nibble, but only <b>1..3</b> validate — 0 and &gt;3 are rejected.</td></tr>
          <tr><td class="mono">role</td><td class="mono">4..5</td><td class="mono">0x30</td>
            <td>0=unknown, 1=striker, 2=goal_keeper, 3=defender.</td></tr>
          <tr><td class="mono">is_alive</td><td class="mono">6</td><td class="mono">0x40</td>
            <td>1 = alive/ready, 0 = fallen / penalized / not ready.</td></tr>
          <tr><td class="mono">is_lead</td><td class="mono">7</td><td class="mono">0x80</td>
            <td>1 = this robot currently holds "lead" status (e.g. actively closing on the ball).</td></tr>
        </tbody>
      </table>
    </div>
    <div class="callout good">
      <strong>Example.</strong> player_id=1, role=striker(1), is_alive=true, is_lead=true →
      <span class="cond">0x01 | 0x10 | 0x40 | 0x80 = 0xD1</span>
    </div>
  </figure>

  <!-- FIGURE 4: ZONE GRID -->
  <figure class="panel" id="zones">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 4</span>
      <h2>The 3×3 field-zone grid</h2>
    </div>
    <p class="panel-desc">Every robot and ball zone nibble (bytes 2–6) refers to one of these 9 zones —
      column-major from own side to opponent side, top to bottom within each column. Zone 0 is reserved
      for "unknown / outside field / unavailable".</p>
    ${zoneGridHtml()}
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Symbol</th><th>Default value</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td class="mono">field_length</td><td class="mono">14.0 m</td><td>~4.6667 m per zone column</td></tr>
          <tr><td class="mono">field_width</td><td class="mono">9.0 m</td><td>~3.0 m per zone row</td></tr>
        </tbody>
      </table>
    </div>
    <pre class="code-block">half_length = field_length / 2
half_width  = field_width / 2
col             = floor((x + half_length) / (field_length / 3)), clamped 0..2
row_from_bottom = floor((y + half_width)  / (field_width  / 3)), clamped 0..2
row_from_top    = 2 - row_from_bottom
zone            = col * 3 + row_from_top + 1</pre>
    <div class="callout">
      <strong>Receive-side precision loss.</strong> A received robot position is reconstructed as the
      <em>center</em> of its zone only — there's no precision byte for robot position the way there is for
      the ball (bytes 14–15). On the wire, every teammate's robot x/y is always zone-resolution, never exact.
    </div>
  </figure>

  <!-- FIGURE 5: BYTES 2-4 -->
  <figure class="panel" id="zone-bytes">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 5</span>
      <h2>Bytes 2–4 — robot &amp; ball zone packing</h2>
      <span class="byte-tag">bytes 2–4</span>
    </div>
    <p class="panel-desc">Straight high-nibble / low-nibble splits — no other bits mixed in. All six
      values here are 4-bit zone codes (0..9).</p>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 4], label: "player1_zone", cat: "zone" },
          { bits: [3, 0], label: "player2_zone", cat: "zone" },
        ],
        "byte2 = (player1_zone &lt;&lt; 4) | player2_zone"
      )}
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 4], label: "player3_zone", cat: "zone" },
          { bits: [3, 0], label: "player1_ball_zone", cat: "zone" },
        ],
        "byte3 = (player3_zone &lt;&lt; 4) | player1_ball_zone"
      )}
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 4], label: "player2_ball_zone", cat: "zone" },
          { bits: [3, 0], label: "player3_ball_zone", cat: "zone" },
        ],
        "byte4 = (player2_ball_zone &lt;&lt; 4) | player3_ball_zone"
      )}
    </div>
    <p class="panel-desc"><strong>Per-player ball zone</strong> (used above): if
      <span class="cond">ball_location_known</span> is false, the zone is 0; otherwise it's the field
      zone of that player's own <span class="cond">ball_pos_to_field_x/y</span>. This is a per-player
      belief, separate from the team's single "final" ball zone in byte 6.</p>
  </figure>

  <!-- FIGURE 6: BYTES 5-6 -->
  <figure class="panel" id="conf-bytes">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 6</span>
      <h2>Bytes 5–6 — ball confidence &amp; final ball zone</h2>
      <span class="byte-tag">bytes 5–6</span>
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 4], label: "player1_confidence", cat: "conf" },
          { bits: [3, 0], label: "player2_confidence", cat: "conf" },
        ],
        "byte5 = (player1_confidence &lt;&lt; 4) | player2_confidence"
      )}
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 4], label: "player3_confidence", cat: "conf" },
          { bits: [3, 0], label: "final_ball_zone", cat: "zone" },
        ],
        "byte6 = (player3_confidence &lt;&lt; 4) | final_ball_zone"
      )}
    </div>
    <pre class="code-block">compact_confidence = round(clamp(confidence_percent, 0, 100) * 15 / 100)
confidence_percent = compact_confidence * 100 / 15   (~6.6667% per step)</pre>
    <div class="callout">
      <strong>final_ball_zone is special.</strong> It requires ball_location_known <em>and</em>
      ball_confidence &gt;= 70.0% — stricter than the per-player ball zones in bytes 3–4. It's computed
      fresh from the sender's own current message every send (never pulled from the cache described below),
      and it's the gate that decides whether bytes 14–15 (precise ball x/y) mean anything at all.
    </div>
  </figure>

  <!-- FIGURE 7: SCORE BYTES -->
  <figure class="panel" id="score-bytes">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 7</span>
      <h2>Bytes 7–12 — chase &amp; goalie scores</h2>
      <span class="byte-tag">bytes 7–12</span>
    </div>
    <p class="panel-desc">Unlike every other multi-value byte in this packet, bytes 7–12 are <em>not</em>
      nibble-packed — each is one full, un-split byte. Both score families share the same 0..100 → 0..255
      encoding; lower is always better (better chaser, better goalkeeper candidate).</p>
    <pre class="code-block">compact_score = round(clamp(score, 0, 100) * 255 / 100)
score         = compact_score * 100 / 255

byte7 = player1_chase_score     byte10 = player1_goalie_score
byte8 = player2_chase_score     byte11 = player2_goalie_score
byte9 = player3_chase_score     byte12 = player3_goalie_score</pre>
    <div class="table-wrap">
      <table class="data-table">
        <tbody>
          <tr><td style="width:160px">Chase score example</td><td>${scoreBarHtml(50, "byte7")}</td></tr>
          <tr><td>Goalie score example</td><td>${scoreBarHtml(200, "byte10")}</td></tr>
        </tbody>
      </table>
    </div>
    <figcaption>Values shown match the worked example in Fig. 11: a compact byte of 50 decodes to a
      score of ~19.6 (good), and 200 decodes to ~78.4 (poor) — lower stays better throughout.</figcaption>
  </figure>

  <!-- FIGURE 8: BYTE 13 -->
  <figure class="panel" id="byte13">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 8</span>
      <h2>Byte 13 — role-switch control</h2>
      <span class="byte-tag">byte 13</span>
    </div>
    <div class="bitfield">
      ${bitfieldTableHtml(
        [
          { bits: [7, 6], label: "opcode", cat: "switch" },
          { bits: [5, 4], label: "seq", cat: "switch" },
          { bits: [3, 2], label: "target", cat: "switch" },
          { bits: [1, 0], label: "role", cat: "switch" },
        ],
        "byte13 = (opcode &lt;&lt; 6) | (seq &lt;&lt; 4) | (target &lt;&lt; 2) | role"
      )}
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Field</th><th>Bits</th><th>Values</th></tr></thead>
        <tbody>
          <tr><td class="mono">opcode</td><td class="mono">6..7</td><td>0=none, 1=request, 2=ack, 3=cancel</td></tr>
          <tr><td class="mono">seq</td><td class="mono">4..5</td><td>0..3 — correlation id (not a free-running counter); matches an ACK/CANCEL back to its REQUEST</td></tr>
          <tr><td class="mono">target</td><td class="mono">2..3</td><td>player id 1..3 this message is about; only meaningful when opcode != 0</td></tr>
          <tr><td class="mono">role</td><td class="mono">0..1</td><td>0=none, 1=striker, 2=goal_keeper, 3=defender — but when opcode != 0, <b>only role==2 is ever accepted</b></td></tr>
        </tbody>
      </table>
    </div>
    <div class="callout">
      <strong>Validation asymmetry.</strong> If opcode == 0, seq/target/role must <em>all</em> be 0.
      If opcode != 0, target must be 1..3 <em>and</em> role must be exactly 2 — this byte only ever
      negotiates goalkeeper handoffs today, nothing else.
    </div>
    <div class="callout good">
      <strong>Example.</strong> Request a goalie switch, seq=2, target=player 3: opcode=1, seq=2, target=3,
      role=2 → <span class="cond">(1&lt;&lt;6)|(2&lt;&lt;4)|(3&lt;&lt;2)|2 = 0x40|0x20|0x0C|0x02 = 0x6E</span>
    </div>
  </figure>

  <!-- FIGURE 9: HANDSHAKE SEQUENCE DIAGRAM -->
  <figure class="panel" id="handshake">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 9</span>
      <h2>The goalie-swap handshake</h2>
    </div>
    <p class="panel-desc">Implemented in <code class="mono">src/brain/src/brain.cpp</code>, driven entirely
      by byte 13. The request/ack/cancel/seq design exists specifically so two robots can never both end
      up believing they're the goalkeeper at once.</p>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Sequence diagram: Requester sends REQUEST to Target, Target replies ACK and Requester finalizes; alternatively if no ACK arrives, Requester reverts and sends CANCEL, which Target uses to also revert">
        <defs>
          <marker id="seq-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/>
          </marker>
          <marker id="seq-arrow-warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--warn)"/>
          </marker>
        </defs>

        <!-- lifelines -->
        <line x1="150" y1="46" x2="150" y2="370" stroke="var(--rule)" stroke-width="2" stroke-dasharray="4 4"/>
        <line x1="490" y1="46" x2="490" y2="370" stroke="var(--rule)" stroke-width="2" stroke-dasharray="4 4"/>
        <rect x="80" y="14" width="140" height="28" rx="3" fill="var(--accent-soft)"/>
        <text x="150" y="33" text-anchor="middle" class="mono" font-size="13" font-weight="700" fill="var(--accent)">Requester</text>
        <rect x="420" y="14" width="140" height="28" rx="3" fill="var(--accent-soft)"/>
        <text x="490" y="33" text-anchor="middle" class="mono" font-size="13" font-weight="700" fill="var(--accent)">Target</text>

        <!-- step 1: REQUEST -->
        <line x1="150" y1="90" x2="482" y2="90" stroke="var(--accent)" stroke-width="2.2" marker-end="url(#seq-arrow)"/>
        <text x="160" y="80" class="mono" font-size="12" font-weight="700" fill="var(--accent)">1. REQUEST(seq, target=Target, role=GK)</text>
        <text x="160" y="106" class="mono" font-size="11" fill="var(--ink-soft)">Requester provisionally → striker / defender</text>

        <!-- step 2: ACK -->
        <line x1="490" y1="150" x2="158" y2="150" stroke="var(--good)" stroke-width="2.2" marker-end="url(#seq-arrow)"/>
        <text x="180" y="140" class="mono" font-size="12" font-weight="700" fill="var(--good)">2. ACK(same seq, target=self, role=GK)</text>
        <text x="330" y="166" class="mono" font-size="11" fill="var(--ink-soft)">Target provisionally → goal_keeper</text>

        <!-- step 3: finalize -->
        <rect x="42" y="182" width="216" height="32" rx="3" fill="var(--good-soft)"/>
        <text x="150" y="203" text-anchor="middle" class="mono" font-size="11.5" fill="var(--good)">3. Requester finalizes</text>

        <!-- divider -->
        <line x1="60" y1="236" x2="580" y2="236" stroke="var(--rule)" stroke-width="1"/>
        <text x="60" y="230" class="mono" font-size="11" fill="var(--mute)">— if no ACK before timeout —</text>

        <!-- step 4: cancel -->
        <line x1="150" y1="280" x2="482" y2="280" stroke="var(--warn)" stroke-width="2.2" stroke-dasharray="6 4" marker-end="url(#seq-arrow-warn)"/>
        <text x="170" y="270" class="mono" font-size="12" font-weight="700" fill="var(--warn)">4. CANCEL(same seq, target=Target, role=GK)</text>
        <text x="150" y="300" class="mono" font-size="11" fill="var(--ink-soft)">Requester reverts to goal_keeper itself,</text>
        <text x="150" y="314" class="mono" font-size="11" fill="var(--ink-soft)">broadcasts CANCEL for a short window</text>

        <rect x="318" y="320" width="304" height="48" rx="3" fill="var(--warn-soft)"/>
        <text x="470" y="340" text-anchor="middle" class="mono" font-size="11.5" fill="var(--warn)">Target sees CANCEL (or Requester</text>
        <text x="470" y="356" text-anchor="middle" class="mono" font-size="11.5" fill="var(--warn)">reappearing as GK) → reverts role</text>
      </svg>
    </div>
    <ol class="mono" style="font-family:inherit;font-size:15px;color:var(--ink-soft);max-width:72ch;margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px">
      <li>Requester decides a teammate is a better goalie candidate, sends REQUEST, and provisionally switches itself to striker/defender.</li>
      <li>Target sees the REQUEST addressed to itself (from a live, lead teammate), provisionally becomes goal_keeper, and replies with ACK.</li>
      <li>Requester sees the matching ACK and finalizes the swap. If no ACK arrives before the timeout, the requester reverts to goal_keeper itself and broadcasts CANCEL for a short window.</li>
      <li>Target, while provisional, watches for a matching CANCEL (or the requester simply reappearing as goal_keeper) and reverts to its prior role if seen.</li>
    </ol>
  </figure>

  <!-- FIGURE 10: BALL XY -->
  <figure class="panel" id="ball-xy">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 10</span>
      <h2>Bytes 14–15 — precise ball position</h2>
      <span class="byte-tag">bytes 14–15</span>
    </div>
    <p class="panel-desc">Two full, un-split bytes — a sub-zone-precision refinement layered on top of
      the coarse <span class="cond">final_ball_zone</span> nibble from byte 6.</p>
    <pre class="code-block">// encode (x over field_length, y over field_width, independently)
normalized = (coord + extent/2) / extent      // 0..1 across the field
byte_value = round(clamp(normalized, 0, 1) * 255)

// decode
coord = (byte_value / 255) * extent - extent/2</pre>
    <div class="svg-wrap">
      <svg viewBox="0 0 640 130" xmlns="http://www.w3.org/2000/svg" role="img"
           aria-label="Number line showing byte value 0 to 255 mapped linearly onto field coordinate -extent/2 to +extent/2">
        <line x1="60" y1="60" x2="580" y2="60" stroke="var(--rule)" stroke-width="2"/>
        <circle cx="60" cy="60" r="5" fill="var(--cat-ball)"/>
        <circle cx="320" cy="60" r="5" fill="var(--cat-ball)"/>
        <circle cx="580" cy="60" r="5" fill="var(--cat-ball)"/>
        <text x="60" y="42" text-anchor="middle" class="mono" font-size="12" font-weight="700" fill="var(--cat-ball)">0</text>
        <text x="320" y="42" text-anchor="middle" class="mono" font-size="12" font-weight="700" fill="var(--cat-ball)">128</text>
        <text x="580" y="42" text-anchor="middle" class="mono" font-size="12" font-weight="700" fill="var(--cat-ball)">255</text>
        <text x="60" y="82" text-anchor="middle" class="mono" font-size="11.5" fill="var(--ink-soft)">-extent/2</text>
        <text x="320" y="82" text-anchor="middle" class="mono" font-size="11.5" fill="var(--ink-soft)">0</text>
        <text x="580" y="82" text-anchor="middle" class="mono" font-size="11.5" fill="var(--ink-soft)">+extent/2</text>
        <text x="320" y="110" text-anchor="middle" class="mono" font-size="11.5" fill="var(--mute)">byte_value (0..255) → field coordinate, linear</text>
      </svg>
    </div>
    <div class="spec-strip">
      <span>field_length = <b>14.0 m</b> → byte 14 (x) resolution ≈ <b>5.5 cm</b>/step</span>
      <span>field_width = <b>9.0 m</b> → byte 15 (y) resolution ≈ <b>3.5 cm</b>/step</span>
      <span>ball_pos_deadband_m (default) = <b>2.0 m</b></span>
    </div>
    <div class="callout">
      <strong>Validity gate — check this first.</strong> Bytes 14–15 are only meaningful when
      <span class="cond">final_ball_zone</span> (byte 6, low nibble) is non-zero. When the ball isn't
      confidently known, both bytes are forced to <span class="cond">0x00</span> on transmit — and 0x00/0x00
      would otherwise decode to a real point on the field (the own-side/top corner). Always check
      final_ball_zone before trusting these two bytes on receive.
    </div>
    <figcaption>Transmit-side smoothing: a deadband (<span class="cond">team_communication.ball_pos_deadband_m</span>,
      default 2.0 m) means these bytes only change once the ball has moved further than that since the
      last value actually sent — while the ball is roughly stationary the bytes stay identical, so this
      never increases send rate beyond the existing event-driven dedup / max_hz / packet budget.</figcaption>
  </figure>

  <!-- VALIDATION -->
  <section class="panel" id="validation">
    <div class="panel-head"><h2>Packet validation rules (on receive)</h2></div>
    <p class="panel-desc">A received packet is accepted only if every rule below holds.</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>#</th><th>Rule</th></tr></thead>
        <tbody>
          <tr><td class="num mono">1</td><td>Packet length is exactly 16 bytes.</td></tr>
          <tr><td class="num mono">2</td><td>Packet length is not larger than 512 bytes (checked in the same comparison — effectively redundant given rule 1).</td></tr>
          <tr><td class="num mono">3</td><td>byte0 equals the configured compact_secret_password.</td></tr>
          <tr><td class="num mono">4</td><td>Sender player ID from byte1 (masked with 0x0F) is 1..3.</td></tr>
          <tr><td class="num mono">5</td><td>Sender role from byte1 is 0..3 (always true, 2 bits).</td></tr>
          <tr><td class="num mono">6</td><td>Player robot zones (bytes 2–3) are all 0..9.</td></tr>
          <tr><td class="num mono">7</td><td>Player ball zones (bytes 3–4) are all 0..9.</td></tr>
          <tr><td class="num mono">8</td><td>Final ball zone (byte 6) is 0..9.</td></tr>
          <tr><td class="num mono">9</td><td>Role-switch control byte (13) is internally consistent (see Fig. 8 validation).</td></tr>
          <tr><td class="num mono">10</td><td>The packet is not from this robot's own player ID (checked after validation, in the receive loop — not inside validate()).</td></tr>
        </tbody>
      </table>
    </div>
    <figcaption>The receiver also suppresses re-publishing a packet if it's byte-for-byte identical to the
      last packet received from that same player ID.</figcaption>
  </section>

  <!-- CACHE -->
  <section class="panel" id="cache">
    <div class="panel-head"><h2>Player state cache</h2></div>
    <p class="panel-desc">Every outgoing packet carries state for all 3 players, not just the sender's own
      latest reading — so hearing from just one teammate still gives a receiver that teammate's most recent
      view of everyone.</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Cached (bytes 2–5, 7–12)</th><th>Always fresh — never cached</th></tr></thead>
        <tbody>
          <tr><td>robot zone</td><td class="mono">identity byte (byte 1)</td></tr>
          <tr><td>ball zone (per-player)</td><td class="mono">final ball zone (byte 6 low nibble)</td></tr>
          <tr><td>ball confidence</td><td class="mono">role-switch control (byte 13)</td></tr>
          <tr><td>chase score</td><td class="mono">ball x / ball y (bytes 14–15)</td></tr>
          <tr><td>goalie score</td><td></td></tr>
        </tbody>
      </table>
    </div>
    <div class="callout">
      <strong>Cache timeout: 5000 ms.</strong> If a player's cached entry is missing or expired, that
      player's cached-type fields go to 0 in the next outgoing packet.
    </div>
  </section>

  <!-- RECONSTRUCTED ROS MESSAGE -->
  <section class="panel" id="ros-in">
    <div class="panel-head"><h2>Reconstructed ROS message after receive</h2></div>
    <p class="panel-desc">Published on <code class="mono">/booster_soccer/team_comm/in</code>:</p>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Field</th><th>Source</th></tr></thead>
        <tbody>
          <tr><td class="mono">validation</td><td>always 31202 (not actually transmitted)</td></tr>
          <tr><td class="mono">communication_id</td><td>always 0 (not transmitted)</td></tr>
          <tr><td class="mono">team_id</td><td>local configured team_id — implied by which UDP port the packet arrived on, not carried in the packet itself</td></tr>
          <tr><td class="mono">player_id</td><td class="mono">byte1 &amp; 0x0F</td></tr>
          <tr><td class="mono">player_role</td><td class="mono">(byte1 &amp; 0x30) &gt;&gt; 4</td></tr>
          <tr><td class="mono">is_alive</td><td class="mono">(byte1 &amp; 0x40) != 0</td></tr>
          <tr><td class="mono">is_lead</td><td class="mono">(byte1 &amp; 0x80) != 0</td></tr>
          <tr><td class="mono">ball_confidence</td><td>decoded from the sender's confidence nibble</td></tr>
          <tr><td class="mono">cost</td><td>decoded from the sender's chase score byte</td></tr>
          <tr><td class="mono">goalie_score</td><td>decoded from the sender's goalie score byte</td></tr>
          <tr><td class="mono">role_switch_opcode/seq/target/role</td><td>decoded from byte13</td></tr>
          <tr><td class="mono">robot_pose_to_field_x/y</td><td>reconstructed as the CENTER of the sender's robot zone (only if zone != 0)</td></tr>
          <tr><td class="mono">robot_pose_to_field_theta</td><td>always 0.0 (never transmitted)</td></tr>
          <tr><td class="mono">ball_location_known / ball_detected</td><td>true iff final_ball_zone != 0</td></tr>
          <tr><td class="mono">ball_pos_to_field_x/y</td><td>decoded from bytes 14–15 (precise), only set when ball_location_known is true</td></tr>
          <tr><td class="mono">ball_pos_to_field_z</td><td>always 0.0</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- LOST FIELDS -->
  <section class="panel" id="lost">
    <div class="panel-head"><h2>ROS fields with no representation in the compact packet</h2></div>
    <p class="panel-desc">Always lost / zeroed for a receiving teammate:</p>
    <div class="table-wrap">
      <table class="data-table">
        <tbody>
          <tr><td class="mono">ball_range</td><td></td></tr>
          <tr><td class="mono">robot_pose_to_field_x/y</td><td>exact value — only zone-center survives</td></tr>
          <tr><td class="mono">robot_pose_to_field_theta</td><td>exact value — always reconstructed as 0.0</td></tr>
          <tr><td class="mono">kick_dir</td><td></td></tr>
          <tr><td class="mono">theta_rb</td><td></td></tr>
          <tr><td class="mono">cmd_id</td><td></td></tr>
          <tr><td class="mono">cmd</td><td>superseded on the wire by the role-switch byte (byte 13)</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <!-- SUMMARY -->
  <section class="panel" id="summary">
    <div class="panel-head"><h2>Complete packing / decoding summary</h2></div>
    <div class="table-wrap" style="display:flex;gap:20px;flex-wrap:wrap">
      <pre class="code-block" style="flex:1;min-width:280px">byte0  = compact_secret_password

byte1  = player_id
       | (role &lt;&lt; 4)
       | (is_alive ? 0x40 : 0x00)
       | (is_lead  ? 0x80 : 0x00)

byte2  = (player1_zone &lt;&lt; 4) | player2_zone
byte3  = (player3_zone &lt;&lt; 4) | player1_ball_zone
byte4  = (player2_ball_zone &lt;&lt; 4) | player3_ball_zone

byte5  = (player1_confidence &lt;&lt; 4) | player2_confidence
byte6  = (player3_confidence &lt;&lt; 4) | final_ball_zone

byte7  = player1_chase_score
byte8  = player2_chase_score
byte9  = player3_chase_score

byte10 = player1_goalie_score
byte11 = player2_goalie_score
byte12 = player3_goalie_score

byte13 = (role_switch_opcode &lt;&lt; 6)
       | (role_switch_seq &lt;&lt; 4)
       | (role_switch_target &lt;&lt; 2)
       | role_switch_role

byte14 = ball_x_quantized
byte15 = ball_y_quantized</pre>
      <pre class="code-block" style="flex:1;min-width:280px">password = byte0

player_id = byte1 &amp; 0x0F
role      = (byte1 &amp; 0x30) &gt;&gt; 4
is_alive  = (byte1 &amp; 0x40) != 0
is_lead   = (byte1 &amp; 0x80) != 0

player1_zone = (byte2 &gt;&gt; 4) &amp; 0x0F
player2_zone = byte2 &amp; 0x0F
player3_zone = (byte3 &gt;&gt; 4) &amp; 0x0F

player1_ball_zone = byte3 &amp; 0x0F
player2_ball_zone = (byte4 &gt;&gt; 4) &amp; 0x0F
player3_ball_zone = byte4 &amp; 0x0F

player1_confidence = (byte5 &gt;&gt; 4) &amp; 0x0F
player2_confidence = byte5 &amp; 0x0F
player3_confidence = (byte6 &gt;&gt; 4) &amp; 0x0F

final_ball_zone = byte6 &amp; 0x0F

player1_chase_score = byte7
player2_chase_score = byte8
player3_chase_score = byte9

player1_goalie_score = byte10
player2_goalie_score = byte11
player3_goalie_score = byte12

role_switch_opcode = (byte13 &amp; 0xC0) &gt;&gt; 6
role_switch_seq    = (byte13 &amp; 0x30) &gt;&gt; 4
role_switch_target = (byte13 &amp; 0x0C) &gt;&gt; 2
role_switch_role   = byte13 &amp; 0x03

ball_x = byte14   // only valid if final_ball_zone != 0
ball_y = byte15   // only valid if final_ball_zone != 0</pre>
    </div>
  </section>

  <!-- FIGURE 11: EXAMPLE -->
  <figure class="panel" id="example">
    <div class="panel-head">
      <span class="fig-no mono">FIG. 11</span>
      <h2>Worked example packet</h2>
    </div>
    <p class="panel-desc">Sender is player 1, striker, alive, lead. Robot in zone 5. Ball known at
      (x=3.00 m, y=-1.00 m) with 80% confidence (&gt;=70%, so final_ball_zone is populated and bytes
      14–15 carry the precise position). No role switch in progress.</p>
    <div class="table-wrap">
      <table class="data-table">
        <tbody>
          <tr><td class="mono">password</td><td class="mono">0xA7</td></tr>
          <tr><td class="mono">player_id / role / alive / lead</td><td class="mono">1 / striker(1) / true / true</td></tr>
          <tr><td class="mono">p1_zone / p2_zone / p3_zone</td><td class="mono">5 / 0 / 0</td></tr>
          <tr><td class="mono">p1_ball_zone / p2 / p3</td><td class="mono">8 / 0 / 0</td></tr>
          <tr><td class="mono">p1_confidence (80% → round(80·15/100))</td><td class="mono">12 / 0 / 0</td></tr>
          <tr><td class="mono">final_ball_zone</td><td class="mono">8</td></tr>
          <tr><td class="mono">p1_chase_score / p2 / p3</td><td class="mono">50 / 0 / 0</td></tr>
          <tr><td class="mono">p1_goalie_score / p2 / p3</td><td class="mono">200 / 0 / 0</td></tr>
          <tr><td class="mono">role_switch_control</td><td class="mono">none</td></tr>
          <tr><td class="mono">ball_x_byte / ball_y_byte</td><td class="mono">182 (0xB6) / 99 (0x63)</td></tr>
        </tbody>
      </table>
    </div>
    <div class="hex-strip">
      <div class="hex-cell"><span class="idx">0</span><br><span class="val">A7</span></div>
      <div class="hex-cell"><span class="idx">1</span><br><span class="val">D1</span></div>
      <div class="hex-cell"><span class="idx">2</span><br><span class="val">50</span></div>
      <div class="hex-cell"><span class="idx">3</span><br><span class="val">08</span></div>
      <div class="hex-cell"><span class="idx">4</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">5</span><br><span class="val">C0</span></div>
      <div class="hex-cell"><span class="idx">6</span><br><span class="val">08</span></div>
      <div class="hex-cell"><span class="idx">7</span><br><span class="val">32</span></div>
      <div class="hex-cell"><span class="idx">8</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">9</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">10</span><br><span class="val">C8</span></div>
      <div class="hex-cell"><span class="idx">11</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">12</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">13</span><br><span class="val">00</span></div>
      <div class="hex-cell"><span class="idx">14</span><br><span class="val">B6</span></div>
      <div class="hex-cell"><span class="idx">15</span><br><span class="val">63</span></div>
    </div>
    <figcaption>Raw hex: <span class="cond">A7 D1 50 08 00 C0 08 32 00 00 C8 00 00 00 B6 63</span></figcaption>
  </figure>

  <!-- COPY SECTION -->
  <section class="copy-section" id="copy">
    <div class="copy-head">
      <div>
        <h2>Copy the full spec</h2>
        <p>The verbatim source text this page was generated from — plain text, safe to paste into a
          doc, PR description, or another repo's docs folder.</p>
      </div>
      <button type="button" class="copy-btn" id="copySpecBtn">Copy spec text</button>
    </div>
    <pre class="spec-pre mono" id="specPre">${escapeHtml(teamCommSpecText)}</pre>
  </section>

  <footer class="tb-footer">Reference documentation for the fixed 16-byte teammate communication packet —
    reproduced from the source implementation's own spec comment, not a literal packet capture.</footer>

</div>
`;

function initInteractive(root, specText) {
  // This page lives under HashRouter, where the URL hash *is* the route.
  // A plain <a href="#byte0"> would get intercepted as a route change (to a
  // nonexistent "/byte0" page) instead of scrolling within this page, so
  // in-page anchors are handled manually here instead.
  const onAnchorClick = (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link || !root.contains(link)) return;
    // Always stop the browser's default hash navigation first — letting a
    // bad/missing id fall through would change window.location.hash, which
    // HashRouter reads as a route change and misroutes to a blank page.
    e.preventDefault();
    const id = link.getAttribute("href").slice(1);
    if (!id) return;
    const target = root.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  root.addEventListener("click", onAnchorClick);

  const btn = root.querySelector("#copySpecBtn");
  if (!btn) return () => root.removeEventListener("click", onAnchorClick);

  let resetTimer = null;
  const onClick = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(specText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = specText;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      btn.textContent = "Copied!";
      btn.classList.add("copied");
    } catch {
      btn.textContent = "Copy failed — select manually";
    }
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.textContent = "Copy spec text";
      btn.classList.remove("copied");
    }, 1800);
  };

  btn.addEventListener("click", onClick);
  return () => {
    btn.removeEventListener("click", onClick);
    if (resetTimer) clearTimeout(resetTimer);
  };
}

export default function TeamCommByteFormat() {
  const rootRef = useRef(null);

  useEffect(() => {
    document.title = "Teammate Communication Byte Format";
    if (!rootRef.current) return;
    const cleanup = initInteractive(rootRef.current, teamCommSpecText);
    return cleanup;
  }, []);

  return (
    <>
      <Header />
      <div
        className="tcbf-page"
        ref={rootRef}
        dangerouslySetInnerHTML={{ __html: CONTENT_HTML }}
      />
    </>
  );
}
