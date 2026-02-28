export type ScoreState = {
  humans: number;
  ai: number;
};

export type AiDifficulty = "easy" | "hard";

export type PlayerState = {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: number;
  connected: boolean;
};

export type Point = {
  x: number;
  y: number;
};

export type StrokeRecord = {
  id: string;
  playerId: string;
  color: string;
  width: number;
  points: Point[];
  createdAt: number;
};

export type VisionLabel = {
  label: string;
  confidence: number;
  normalized: string;
};

export type GuessFeedEntry = {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  normalized: string;
  bucketIndex: number;
  createdAt: number;
  isCorrect: boolean;
};

export type AiGuessBatch = {
  bucketIndex: number;
  labels: VisionLabel[];
  createdAt: number;
  matched: boolean;
};

export type RoundStatus = "active" | "ended";
export type RoomPhase = "lobby" | "round" | "intermission" | "paused";
export type RoundWinner = "humans" | "ai" | "none";
export type RoundReason = "human_guess" | "ai_guess" | "timeout" | "drawer_disconnect";

export type RoundState = {
  roundId: string;
  roundNumber: number;
  drawerPlayerId: string;
  bucketIndex: number;
  startedAt: number;
  endsAt: number;
  status: RoundStatus;
};

export type RoundResult = {
  winner: RoundWinner;
  reason: RoundReason;
  answer: string;
  correctHumanGuessCount: number;
  winningPlayerId?: string;
  winningAiLabel?: VisionLabel;
};

export type WordEntry = {
  id: string;
  answer: string;
  aliases: string[];
  category: string;
  difficulty: "easy" | "medium";
};

export type RoomState = {
  roomCode: string;
  hostPlayerId: string;
  aiDifficulty: AiDifficulty;
  players: PlayerState[];
  score: ScoreState;
  phase: RoomPhase;
  currentRound: RoundState | null;
  guesses: GuessFeedEntry[];
  aiHistory: AiGuessBatch[];
  strokes: StrokeRecord[];
  lastResult: RoundResult | null;
};

export type GameConfig = {
  roundDurationSeconds: number;
  guessIntervalSeconds: number;
  intermissionSeconds: number;
  minPlayers: number;
  maxPlayers: number;
  canvasSize: number;
  visionMinConfidence: number;
  maxVisionLabels: number;
};
