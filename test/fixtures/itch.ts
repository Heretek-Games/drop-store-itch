export const caveRows = [
  {
    id: 1,
    game_id: 267856,
    title: "Celeste",
    path: "C:\\Games\\itch\\celeste",
  },
  {
    caveId: 2,
    gameId: 408527,
    game: JSON.stringify({ id: 408527, title: "A Short Hike" }),
    path: "/home/john/Games/itch/a-short-hike",
    executable_path: "bin/a-short-hike",
  },
  {
    id: 3,
    game_id: null,
    title: "orphan row",
    path: "/games/orphan",
  },
];

export const caveDbExport = { caves: caveRows };

export const absoluteExecutableCaveRows = [
  {
    id: 4,
    game_id: 999001,
    title: "Absolute Executable",
    path: "/games/itch/absolute",
    executable: "/opt/games/absolute/run.sh",
  },
];
