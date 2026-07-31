// Verbatim source spec for the teammate communication byte format, reproduced
// exactly as written so the copy button on TeamCommByteFormat.jsx always
// hands out the authoritative text byte-for-byte.

const teamCommSpecText = `TEAMMATE COMMUNICATION BYTE FORMAT
===================================

This project sends teammate robot communication as a fixed 16-byte UDP
broadcast packet. There is no legacy/shorter format and no longer
format accepted on receive - exactly 16 bytes or the packet is
dropped.

Source implementation:
  src/robot_communication/src/robot_communication_node.cpp

ROS input topic (this robot's own outgoing state):
  /booster_soccer/team_comm/out

ROS output topic (after receiving + decoding a teammate's packet):
  /booster_soccer/team_comm/in

UDP port:
  10000 + team_id

Default broadcast address:
  255.255.255.255

Default compact password:
  0xA7  (167 decimal), configurable via compact_secret_password,
  clamped to 0..255

Packet size transmitted:
  exactly 16 bytes

Packet sizes accepted on receive:
  exactly 16 bytes. Anything else (including 14/15/18) is rejected as
  "unexpected packet size". Absolute upper bound before any length
  check even applies is 512 bytes.


HIGH LEVEL PACKET LAYOUT
=========================

Index  Name                         Summary
-----  ---------------------------  ------------------------------------------
0      password                     Shared compact password/check byte
1      identity                     Sender player id, role, alive, lead
2      player zones 1 and 2         Player 1 robot zone, player 2 robot zone
3      player 3 zone + p1 ball      Player 3 robot zone, player 1 ball zone
4      player 2 and 3 ball zones    Player 2 ball zone, player 3 ball zone
5      player 1 and 2 confidence    Player 1 ball confidence, player 2 confidence
6      p3 confidence + final ball   Player 3 confidence, final ball zone
7      player 1 chase score         Player 1 compact chase score
8      player 2 chase score         Player 2 compact chase score
9      player 3 chase score         Player 3 compact chase score
10     player 1 goalie score        Player 1 compact goalie score
11     player 2 goalie score        Player 2 compact goalie score
12     player 3 goalie score        Player 3 compact goalie score
13     role-switch control          Role-switch opcode, sequence, target, role
14     ball x                       Quantized precise ball x position
15     ball y                       Quantized precise ball y position


BYTE 0: PASSWORD
=================

Bits:
  7 6 5 4 3 2 1 0
  P P P P P P P P

Meaning:
  Shared password/check byte. A received packet is rejected if byte 0
  does not equal the locally configured compact_secret_password.

Default:
  0xA7 (167)

Packing:
  byte0 = compact_secret_password


BYTE 1: IDENTITY BYTE
=======================

Bits:
  7      6      5 4     3 2 1 0
  lead   alive  role    player_id

Bit masks:
  player_id mask: 0x0F
  role mask:      0x30   shift 4
  alive mask:     0x40
  lead mask:      0x80

Fields:
  bits 0..3:
    Sender player ID. Full 4-bit nibble, but only 1..3 are valid
    (validation rejects 0 and anything > 3).

  bits 4..5:
    Sender role.
      0 = unknown
      1 = striker
      2 = goal_keeper
      3 = defender
    Validation rejects a decoded role > 3 (impossible with 2 bits, so
    this check is effectively unreachable, but it exists).

  bit 6:
    is_alive. 1 = alive/ready, 0 = fallen/penalized/not ready.

  bit 7:
    is_lead. 1 = this robot currently holds "lead" status (e.g. the
    one actively closing on/handling the ball among teammates),
    0 = not lead.

Packing:
  byte1 = player_id
        | (role << 4)
        | (is_alive ? 0x40 : 0x00)
        | (is_lead  ? 0x80 : 0x00)

Decoding:
  player_id = byte1 & 0x0F
  role      = (byte1 & 0x30) >> 4
  is_alive  = (byte1 & 0x40) != 0
  is_lead   = (byte1 & 0x80) != 0

Example:
  player_id = 1, role = striker (1), is_alive = true, is_lead = true
  byte1 = 0x01 | 0x10 | 0x40 | 0x80 = 0xD1


BYTES 2 TO 4: ROBOT AND BALL ZONES
====================================

All zones are 4-bit nibbles.

Valid zone values:
  0 = unknown, outside field, or unavailable
  1..9 = known field zone

The field is a 3x3 grid, column-major from own side to opponent side,
top to bottom within each column:

                y positive (top)

    own side           center            opponent side
  +-----------+     +-----------+      +-----------+
  |  zone 1   |     |  zone 4   |      |  zone 7   |
  +-----------+     +-----------+      +-----------+
  |  zone 2   |     |  zone 5   |      |  zone 8   |
  +-----------+     +-----------+      +-----------+
  |  zone 3   |     |  zone 6   |      |  zone 9   |
  +-----------+     +-----------+      +-----------+

                y negative (bottom)

Default field dimensions:
  field_length = 14.0 m   (~4.6667 m per zone column)
  field_width  = 9.0 m    (~3.0 m per zone row)

BYTE 2: PLAYER 1 AND PLAYER 2 ROBOT ZONES
-------------------------------------------
  byte2 = (player1_zone << 4) | player2_zone
  player1_zone = (byte2 >> 4) & 0x0F
  player2_zone = byte2 & 0x0F

BYTE 3: PLAYER 3 ROBOT ZONE AND PLAYER 1 BALL ZONE
-----------------------------------------------------
  byte3 = (player3_zone << 4) | player1_ball_zone
  player3_zone      = (byte3 >> 4) & 0x0F
  player1_ball_zone = byte3 & 0x0F

BYTE 4: PLAYER 2 AND PLAYER 3 BALL ZONES
--------------------------------------------
  byte4 = (player2_ball_zone << 4) | player3_ball_zone
  player2_ball_zone = (byte4 >> 4) & 0x0F
  player3_ball_zone = byte4 & 0x0F


HOW ROBOT ZONES ARE CREATED
=============================

If the point is outside the configured field: zone = 0. Otherwise:

  half_length = field_length / 2
  half_width  = field_width / 2
  col             = floor((x + half_length) / (field_length / 3)), clamped 0..2
  row_from_bottom = floor((y + half_width)  / (field_width  / 3)), clamped 0..2
  row_from_top    = 2 - row_from_bottom
  zone            = col * 3 + row_from_top + 1

Received robot positions are reconstructed as the CENTER of the zone
only. There is no precision byte for robot position - unlike the
ball, robot x/y is always zone-resolution on the receiving end.


HOW BALL ZONES ARE CREATED
=============================

Per-player ball zone (bytes 3-4):
  If ball_location_known is false: player_ball_zone = 0
  Else: player_ball_zone = field zone of ball_pos_to_field_x/y

Final ball zone (byte 6 low nibble):
  If ball_location_known is false OR ball_confidence < 70.0: zone = 0
  Else: zone = field zone of ball_pos_to_field_x/y

  Final ball zone requires >=70% confidence on top of "location
  known". This is computed fresh from the sender's own current
  message every send - it is NOT pulled from the player-state cache
  the way the per-player zone/ball-zone/confidence/scores are (see
  the "PLAYER STATE CACHE" section below). It also gates whether
  bytes 14-15 (precise ball x/y) are meaningful on receive.


BYTES 5 TO 6: BALL CONFIDENCE AND FINAL BALL ZONE
====================================================

Confidence is a 4-bit value:
  compact_confidence = round(clamp(confidence_percent, 0, 100) * 15 / 100)
  confidence_percent = compact_confidence * 100 / 15   (~6.6667% per step)

BYTE 5: PLAYER 1 AND PLAYER 2 BALL CONFIDENCE
-------------------------------------------------
  byte5 = (player1_confidence << 4) | player2_confidence
  player1_confidence = (byte5 >> 4) & 0x0F
  player2_confidence = byte5 & 0x0F

BYTE 6: PLAYER 3 BALL CONFIDENCE AND FINAL BALL ZONE
---------------------------------------------------------
  byte6 = (player3_confidence << 4) | final_ball_zone
  player3_confidence = (byte6 >> 4) & 0x0F
  final_ball_zone    = byte6 & 0x0F


BYTES 7 TO 9: CHASE SCORES
=============================

Chase score: normalized 0..100 score, lower is better, used to decide
which robot should chase the ball.

  compact_score = round(clamp(score, 0, 100) * 255 / 100)
  score         = compact_score * 100 / 255

  byte7 = player1_chase_score
  byte8 = player2_chase_score
  byte9 = player3_chase_score

(each is a full, un-split byte - no bit packing within 7/8/9)


BYTES 10 TO 12: GOALIE SCORES
================================

Same 0..100 -> 0..255 encoding as chase scores. Lower is better,
used for goalkeeper suitability / the goalie role-switch decision.

  byte10 = player1_goalie_score
  byte11 = player2_goalie_score
  byte12 = player3_goalie_score


BYTE 13: ROLE-SWITCH CONTROL
===============================

Bits:
  7 6      5 4      3 2       1 0
  opcode   seq      target    role

Bit masks:
  opcode mask: 0xC0   shift 6
  seq mask:    0x30   shift 4
  target mask: 0x0C   shift 2
  role mask:   0x03   shift 0

Fields:
  bits 6..7: opcode   0=none, 1=request, 2=ack, 3=cancel
  bits 4..5: seq      0..3, a correlation id (not a free-running
                      counter) - lets an ACK/CANCEL be matched back to
                      the REQUEST it answers, and lets a request sender
                      recognize/ignore its own already-handled request
                      being re-broadcast
  bits 2..3: target   player id 1..3 this message is about; only
                      meaningful when opcode != 0
  bits 0..1: role     0=none/unknown, 1=striker, 2=goal_keeper,
                      3=defender - but when opcode != 0, only role==2
                      (goal_keeper) is ever accepted; this byte only
                      ever negotiates goalkeeper handoffs today

Packing:
  byte13 = (opcode << 6) | (seq << 4) | (target << 2) | role

Decoding:
  opcode = (byte13 & 0xC0) >> 6
  seq    = (byte13 & 0x30) >> 4
  target = (byte13 & 0x0C) >> 2
  role   = byte13 & 0x03

Validation:
  If opcode == 0: seq, target, and role must all be 0.
  If opcode != 0: target must be 1..3 and role must be exactly 2.

Purpose - the goalie-swap handshake (implemented in src/brain/src/brain.cpp):
  1. Requester decides a teammate is a better goalie candidate, sends
     REQUEST(seq, target=teammate, role=goal_keeper), and provisionally
     switches itself to striker/defender.
  2. Target sees the REQUEST addressed to itself (from a live, lead
     teammate), provisionally becomes goal_keeper, replies with
     ACK(same seq, target=self, role=goal_keeper).
  3. Requester sees the matching ACK and finalizes the swap. If no ACK
     arrives before the timeout, the requester reverts to goal_keeper
     itself and broadcasts CANCEL for a short window so the target
     reliably learns the swap fell through.
  4. Target, while provisional, watches for a matching CANCEL (or the
     requester simply reappearing as goal_keeper) and reverts to its
     prior role if seen.
  The request/ack/cancel/seq design exists specifically so two robots
  can never both end up believing they are the goalkeeper at once.

Example: request goalie switch, sequence 2, target player 3:
  opcode=1, seq=2, target=3, role=2
  byte13 = (1<<6) | (2<<4) | (3<<2) | 2 = 0x40|0x20|0x0C|0x02 = 0x6E


BYTES 14-15: BALL X AND BALL Y
==================================

Two full, un-split bytes. A precise refinement on top of the coarse
final_ball_zone nibble (byte 6), giving ball position to sub-zone
precision.

Validity gate:
  Only meaningful when final_ball_zone (byte 6 low nibble) is
  non-zero. When the ball isn't confidently known, both bytes are
  forced to 0x00 on transmit - always check final_ball_zone before
  trusting these bytes on receive, since 0x00/0x00 would otherwise
  decode to a real point on the field (the own-side/top corner).

Encoding (x over field_length, y over field_width, independently):
  normalized = (coord + extent/2) / extent      (0..1 across the field)
  byte_value = round(clamp(normalized, 0, 1) * 255)

Decoding:
  coord = (byte_value / 255) * extent - extent/2

Resolution at default dimensions:
  field_length = 14.0 m -> ~5.5 cm per step (byte 14, ball x)
  field_width  = 9.0 m  -> ~3.5 cm per step (byte 15, ball y)

Transmit-side smoothing:
  A deadband (team_communication.ball_pos_deadband_m, default 2.0 m)
  is applied: the emitted bytes only change once the ball has moved
  further than that since the last value actually sent. While the
  ball is roughly stationary, these bytes stay identical, so this
  never increases send rate beyond the event-driven dedup / max_hz /
  packet budget already in place.


PACKET VALIDATION RULES (on receive)
========================================

A received packet is accepted only if all of these are true:

1. Packet length is exactly 16 bytes.
2. Packet length is not larger than 512 bytes (checked as part of the
   same comparison, effectively redundant given rule 1).
3. byte0 equals the configured compact_secret_password.
4. Sender player ID from byte1 (masked with 0x0F) is 1..3.
5. Sender role from byte1 is 0..3 (always true, 2 bits).
6. Player robot zones (bytes 2-3) are all 0..9.
7. Player ball zones (bytes 3-4) are all 0..9.
8. Final ball zone (byte 6) is 0..9.
9. Role-switch control byte (13) is internally consistent (see BYTE 13
   validation above).
10. The packet is not from this robot's own player ID (checked after
    validation, in the receive loop, not inside validate()).

The receiver also suppresses re-publishing a packet if it is
byte-for-byte identical to the last packet received from that same
player ID.


PLAYER STATE CACHE
=====================

Each outgoing packet carries state for all 3 players, not only the
sender's own latest reading - so a receiver hearing from just one
teammate still gets that teammate's most recent view of everyone.

Cached fields (bytes 2-5, 7-12 - refreshed from whichever player was
most recently heard from, including the sender's own just-updated
state):
  robot zone
  ball zone (per-player)
  ball confidence
  chase score
  goalie score

NOT cached - always taken fresh from the current outgoing message
only, every send:
  identity byte (byte 1)
  final ball zone (byte 6 low nibble)
  role-switch control (byte 13)
  ball x / ball y (bytes 14-15)

Cache timeout:
  5000 ms. If a player's cached entry is missing or expired, that
  player's cached-type fields go to 0 in the next outgoing packet.


RECONSTRUCTED ROS MESSAGE AFTER RECEIVE
===========================================

Published on /booster_soccer/team_comm/in:

  validation:              always 31202 (not actually transmitted)
  communication_id:        always 0 (not transmitted)
  team_id:                 local configured team_id (implied by which
                            UDP port the packet arrived on, not carried
                            in the packet itself)
  player_id:                byte1 & 0x0F
  player_role:               (byte1 & 0x30) >> 4
  is_alive:                 (byte1 & 0x40) != 0
  is_lead:                  (byte1 & 0x80) != 0
  ball_confidence:          decoded from the sender's confidence nibble
  cost:                     decoded from the sender's chase score byte
  goalie_score:             decoded from the sender's goalie score byte
  role_switch_opcode/seq/target/role:  decoded from byte13
  robot_pose_to_field_x/y:   reconstructed as the CENTER of the
                            sender's robot zone (only if zone != 0)
  robot_pose_to_field_theta: always 0.0 (never transmitted)
  ball_location_known / ball_detected:  true iff final_ball_zone != 0
  ball_pos_to_field_x/y:     decoded from bytes 14-15 (precise), only
                            set when ball_location_known is true
  ball_pos_to_field_z:       always 0.0


ROS FIELDS WITH NO REPRESENTATION IN THE COMPACT PACKET
===========================================================

Always lost/zeroed for a receiving teammate:
  ball_range
  exact robot_pose_to_field_x/y  (only zone-center survives)
  exact robot_pose_to_field_theta  (always reconstructed as 0.0)
  kick_dir
  theta_rb
  cmd_id
  cmd   (superseded on the wire by the role-switch byte, byte 13)


COMPLETE PACKING SUMMARY
============================

byte0  = compact_secret_password

byte1  = player_id
       | (role << 4)
       | (is_alive ? 0x40 : 0x00)
       | (is_lead  ? 0x80 : 0x00)

byte2  = (player1_zone << 4) | player2_zone
byte3  = (player3_zone << 4) | player1_ball_zone
byte4  = (player2_ball_zone << 4) | player3_ball_zone

byte5  = (player1_confidence << 4) | player2_confidence
byte6  = (player3_confidence << 4) | final_ball_zone

byte7  = player1_chase_score
byte8  = player2_chase_score
byte9  = player3_chase_score

byte10 = player1_goalie_score
byte11 = player2_goalie_score
byte12 = player3_goalie_score

byte13 = (role_switch_opcode << 6)
       | (role_switch_seq << 4)
       | (role_switch_target << 2)
       | role_switch_role

byte14 = ball_x_quantized
byte15 = ball_y_quantized


COMPLETE DECODING SUMMARY
=============================

password = byte0

player_id = byte1 & 0x0F
role      = (byte1 & 0x30) >> 4
is_alive  = (byte1 & 0x40) != 0
is_lead   = (byte1 & 0x80) != 0

player1_zone = (byte2 >> 4) & 0x0F
player2_zone = byte2 & 0x0F
player3_zone = (byte3 >> 4) & 0x0F

player1_ball_zone = byte3 & 0x0F
player2_ball_zone = (byte4 >> 4) & 0x0F
player3_ball_zone = byte4 & 0x0F

player1_confidence = (byte5 >> 4) & 0x0F
player2_confidence = byte5 & 0x0F
player3_confidence = (byte6 >> 4) & 0x0F

final_ball_zone = byte6 & 0x0F

player1_chase_score = byte7
player2_chase_score = byte8
player3_chase_score = byte9

player1_goalie_score = byte10
player2_goalie_score = byte11
player3_goalie_score = byte12

role_switch_opcode = (byte13 & 0xC0) >> 6
role_switch_seq    = (byte13 & 0x30) >> 4
role_switch_target = (byte13 & 0x0C) >> 2
role_switch_role   = byte13 & 0x03

ball_x = byte14   (only valid if final_ball_zone != 0)
ball_y = byte15   (only valid if final_ball_zone != 0)


EXAMPLE PACKET
==================

Sender is player 1, striker, alive, lead. Robot in zone 5. Ball known
at (x=3.00m, y=-1.00m) with 80% confidence (>=70%, so final_ball_zone
is populated and bytes 14-15 carry the precise position). No role
switch in progress.

  password = 0xA7
  player_id=1, role=striker(1), alive=true, lead=true
  p1_zone=5, p2_zone=0, p3_zone=0
  p1_ball_zone=8, p2_ball_zone=0, p3_ball_zone=0
  p1_confidence=12 (80% -> round(80*15/100)=12), p2=0, p3=0
  final_ball_zone=8
  p1_chase_score=50, p2=0, p3=0
  p1_goalie_score=200, p2=0, p3=0
  role_switch_control = none
  ball_x_byte=182 (0xB6), ball_y_byte=99 (0x63)

Bytes:
  byte0  = 0xA7
  byte1  = 0xD1
  byte2  = 0x50
  byte3  = 0x08
  byte4  = 0x00
  byte5  = 0xC0
  byte6  = 0x08
  byte7  = 0x32
  byte8  = 0x00
  byte9  = 0x00
  byte10 = 0xC8
  byte11 = 0x00
  byte12 = 0x00
  byte13 = 0x00
  byte14 = 0xB6
  byte15 = 0x63

Raw hex:
  A7 D1 50 08 00 C0 08 32 00 00 C8 00 00 00 B6 63
`;

export default teamCommSpecText;
