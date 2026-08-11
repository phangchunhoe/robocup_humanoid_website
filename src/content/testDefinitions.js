// Edit this file to change what shows up in the Testing tab's card list.
// No other code needs to change — the list just renders whatever is here.
//
// Add a new test by copying one of the blocks below. `id` must be unique
// (used as the React key and the shared layoutId for the expand animation).

const testDefinitions = [
  {
    id: "approach-kick-time",
    title: "Approach & Kick Time",
    sm: "Approach and kick timing across starting positions.",
    // Only used as a fallback (e.g. for assistive tech reading order before
    // the rich content mounts) — the modal itself renders
    // <ApproachKickTimeExplainer> for this id instead of this plain string,
    // see TestCard.jsx.
    description:
      "Simulates all 36 strikers moving from their testing spot to their " +
      "kick position. The distance between striker and ball, x, is an " +
      "unknown the user determines before the test runs.",
  },
  {
    id: "time-to-find-ball",
    title: "Time to Find Ball",
    sm: "How long the robot takes to locate the ball.",
    description:
      "Placeholder description — measures how long the robot takes to " +
      "locate the ball from a search/idle state before it begins to " +
      "approach.",
  },
];

export default testDefinitions;
