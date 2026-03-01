import type {
  AiDifficulty,
  AiGuessBatch,
  GameMode,
  GuessFeedEntry,
  PlayerState,
  RoomPhase,
  RoundResult,
  RoundState,
  ScoreState,
  WordEntry
} from "@skribbl-ai/shared";
import type { StrokeStore } from "../services/StrokeStore.js";

export type PlayerRuntime = PlayerState & {
  socketId: string;
  lastStrokeEventAt: number;
};

export type RoundRuntime = {
  state: RoundState;
  word: WordEntry;
  strokeStore: StrokeStore;
  guessBuckets: Map<number, Set<string>>;
  aiInFlight: boolean;
  completedBuckets: Set<number>;
};

export type RoomRuntime = {
  roomCode: string;
  hostPlayerId: string;
  aiDifficulty: AiDifficulty;
  gameMode: GameMode;
  players: PlayerRuntime[];
  score: ScoreState;
  phase: RoomPhase;
  currentRound: RoundRuntime | null;
  guesses: GuessFeedEntry[];
  aiHistory: AiGuessBatch[];
  lastResult: RoundResult | null;
  drawerCursor: number;
  roundCount: number;
  lastWordId: string | null;
  lastActivityAt: number;
  intermissionTimer: NodeJS.Timeout | null;
};
