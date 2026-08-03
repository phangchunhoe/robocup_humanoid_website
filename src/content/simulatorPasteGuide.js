// Text shown on the simulator's editor step. Edit this file to change the paste
// instructions; no other code needs to change.

export const BRAIN_REPO_PATH = "Robocup-Humanoid-/src/brain";

export const TABS = [
  {
    id: "cpp",
    label: "C++ nodes",
    required: true,
    file: "src/brain_tree.cpp",
    hint: "Paste the whole file. Only the chase / adjust / decide / kick functions are extracted and interpreted — the other ~10,900 lines are ignored without error.",
    placeholder:
      "// Paste the full contents of Robocup-Humanoid-/src/brain/src/brain_tree.cpp here.\n" +
      "//\n" +
      "// These functions will be extracted and executed:\n" +
      "//   TickChaseNode              StrikerChase::tick     GoalieChase::tick\n" +
      "//   Adjust::tick               StrikerDecide::tick    GoalieDecide::tick\n" +
      "//   Kick::onStart              Kick::onRunning        CalcKickDir::tick\n" +
      "//   GoToGoalBlockingPosition::tick  (goalkeeper 'retreat')\n" +
      "//\n" +
      "// Everything else in the file is skipped.",
  },
  {
    id: "xml",
    label: "Behaviour XML",
    required: true,
    file: "behavior_trees/subtrees/subtree_striker_play.xml",
    hint: "Supplies the port values the C++ reads through getInput(): vx_limit, dist, safe_dist, curve_lateral_gain, chase_threshold, the adjust ranges and the kick tolerances.",
    placeholder:
      "<!-- Paste subtree_striker_play.xml (striker) or subtree_goal_keeper_play.xml (goalkeeper). -->\n" +
      "<!-- Port values are read from the <StrikerChase>, <Adjust>, <Kick>, <StrikerDecide> tags. -->",
  },
  {
    id: "header",
    label: "Node header",
    required: true,
    file: "include/brain_tree.h",
    hint: "Required in practice: the XML only sets a handful of ports, and providedPorts() in this header supplies the rest. Without it, ports such as Adjust's session_timeout_ms resolve to 0 and the node stops working. Also supplies node member initial values.",
    placeholder:
      "// Optional — paste Robocup-Humanoid-/src/brain/include/brain_tree.h here.\n" +
      "//\n" +
      "// Used for two things:\n" +
      "//   1. InputPort<double>(\"dist\", 0.1, ...)  -> default when the XML omits a port\n" +
      "//   2. double _lockDurationMs = 1200.0;      -> initial node member state",
  },
];

export const CONFIG_NOTE =
  "config.yaml is not pasted. brain->config->get_*() returns the repo defaults, listed under " +
  "“Constants this run assumed” on the simulation view.";

export const INTRO =
  "Open your Robocup-Humanoid- checkout (or its src/brain folder) below and the three files " +
  "are found and loaded automatically, choose a role, then press Run. The source is parsed " +
  "into an AST and executed at 100 Hz against a mocked brain object — the robot you see is " +
  "driven by setVelocity() calls made by your code, not by a reimplementation of it. Manual " +
  "paste still works per-tab if a file cannot be located or you want to try an edited version.";

// Path of each required file relative to the brain package root (…/src/brain), used to
// locate it inside whatever folder the user opens. The xml file name is role-dependent —
// its role id doubles as the file's name segment (subtree_<role>_play.xml).
export function expectedRelPath(tabId, roleId) {
  if (tabId === "xml") return `behavior_trees/subtrees/subtree_${roleId}_play.xml`;
  const tab = TABS.find((t) => t.id === tabId);
  return tab ? tab.file : null;
}
