// Cheat-sheet shown in the Home page's "Handy Commands" section. Edit this
// file to add, remove, or reorder commands — no other code needs to change.
//
// Shape: a list of sections, each with a `title` and one or more `groups`.
// A group is a short `label` (what the commands below it do), an optional
// `note` (context, a placeholder to fill in, or what to do once you're
// there), a `commands` array of `{ command }` run in order, and an optional
// `snippet` — shown behind a "Show ..." disclosure so a user can see exactly
// where in a file the note above is talking about. A snippet is
// `{ file, summary, lines }`, where each line is a string or
// `{ text, emphasis: true }` for the one line the note is actually about.

const handyCommands = [
  {
    title: "Run Game Controller & Connect Robot",
    groups: [
      {
        label: "On your NUC",
        commands: [
          { command: "cd Desktop/GameController" },
          { command: "cargo run -r" },
        ],
      },
      {
        label: "On the robot",
        note: "The IP address of the Ethernet interface connected to the robot is 192.168.10.102.",
        commands: [
          { command: "ssh booster@<robotsIP>" },
          { command: "cd Workspace/robocup_demo" },
          { command: "./script/start.sh" },
        ],
      },
      {
        label: "Or, start with team / player / role set explicitly",
        note: "Usage: ./script/master_start.sh <teamId> <playerId> <playerRole>",
        commands: [{ command: "./script/master_start.sh 55 1 striker" }],
      },
    ],
  },
  {
    title: "Changing Wi-Fi Network",
    groups: [
      {
        label: "See available networks",
        commands: [{ command: "nmcli device wifi" }],
      },
      {
        label: "See the currently connected network",
        commands: [{ command: "nmcli device" }],
      },
      {
        label: "Connect to a network",
        commands: [
          { command: 'sudo nmcli device wifi connect "wifiname" password "password"' },
        ],
      },
      {
        label: "Rescan for nearby networks",
        commands: [{ command: "sudo nmcli device wifi --rescan" }],
      },
      {
        label: "Turn the Wi-Fi radio off, then back on",
        note: "Useful when a connection is stuck.",
        commands: [
          { command: "sudo nmcli radio wifi off" },
          { command: "sudo nmcli radio wifi on" },
        ],
      },
    ],
  },
  {
    title: "Connecting the Robot to the Game Controller",
    groups: [
      {
        label: "1. Find the game controller's IP",
        note: "Run this on the game controller machine.",
        commands: [{ command: "hostname -I" }],
      },
      {
        label: "2. Whitelist that IP",
        note: "Add the IP address as a new entry in launch.py's ip_white_list list.",
        commands: [
          { command: "cd C:\\Users\\phang\\Desktop\\robocup_demo\\src\\game_controller\\launch" },
          { command: "nano launch.py" },
        ],
        snippet: {
          file: "src/game_controller/launch/launch.py",
          summary: "Show where in launch.py",
          lines: [
            '# control if to enable IP white list check, default False, if True, only',
            '# packets from IPs in ip_white_list will be accepted',
            '"enable_ip_white_list": True,',
            '',
            '# only accept packets from these IP addresses if enable_ip_white_list is True',
            '"ip_white_list": [',
            '    "192.168.0.100",',
            { text: '    "<gameControllerIP>",  # add the IP from step 1 here', emphasis: true },
            '],',
          ],
        },
      },
      {
        label: "3. Point the robot at the same IP",
        note: "Replace game_control_ip with the game controller's IP address.",
        commands: [
          { command: "cd C:\\Users\\phang\\Desktop\\robocup_demo\\src\\brain\\config" },
          { command: "nano config.yaml" },
        ],
        snippet: {
          file: "src/brain/config/config.yaml",
          summary: "Show where in config.yaml",
          lines: [
            { text: 'game_control_ip: "192.168.0.100" #for nuc', emphasis: true },
            '# game_control_ip: "192.168.0.150" #for geekcom',
          ],
        },
      },
    ],
  },
  {
    title: "Merging Branches",
    groups: [
      {
        label: "1. Adding and Commiting Messages",
        note: "Run this on the repository folder path",
        commands: [
          { command: "git add ." },
          { command: "git commit -m '<commit message'" },
        ]
      },
      {
        label: "See Existing Branches",
        commands: [
          { command: "git branch "},
        ],

        label: "Merge branch together",
        commands: [
          { command: "git merge <branch name> "},
        ]
      }
    ]
  }
];

export default handyCommands;
