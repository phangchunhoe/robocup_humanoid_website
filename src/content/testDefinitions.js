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
    description:
      "Placeholder description — measures how long the robot takes to " +
      "approach the ball and execute a kick, repeated from a range of " +
      "different starting positions on the pitch.",
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
