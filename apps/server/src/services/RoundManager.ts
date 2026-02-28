import { nanoid } from "nanoid";
import {
  GUESS_INTERVAL_SECONDS,
  INTERMISSION_SECONDS,
  MIN_PLAYERS,
  ROUND_DURATION_SECONDS,
  type RoundResult
} from "@skribbl-ai/shared";
import type { RoomRuntime, RoundRuntime } from "../game/types.js";
import { StrokeStore } from "./StrokeStore.js";
import { WordBankService } from "./WordBankService.js";

type RoundManagerOptions = {
  roundDurationSeconds?: number;
  guessIntervalSeconds?: number;
  intermissionSeconds?: number;
};

export class RoundManager {
  readonly roundDurationSeconds: number;
  readonly guessIntervalSeconds: number;
  readonly intermissionSeconds: number;

  constructor(private readonly wordBank: WordBankService, options: RoundManagerOptions = {}) {
    this.roundDurationSeconds = options.roundDurationSeconds ?? ROUND_DURATION_SECONDS;
    this.guessIntervalSeconds = options.guessIntervalSeconds ?? GUESS_INTERVAL_SECONDS;
    this.intermissionSeconds = options.intermissionSeconds ?? INTERMISSION_SECONDS;
  }

  canStart(room: RoomRuntime): boolean {
    return room.players.length >= MIN_PLAYERS && (room.phase === "lobby" || room.phase === "paused");
  }

  startNextRound(room: RoomRuntime): RoundRuntime {
    if (room.players.length < MIN_PLAYERS) {
      throw new Error("At least two players are required");
    }

    const nextDrawerIndex = (room.drawerCursor + 1) % room.players.length;
    const drawer = room.players[nextDrawerIndex]!;
    const word = this.wordBank.pickWord(room.lastWordId);
    const startedAt = Date.now();

    room.drawerCursor = nextDrawerIndex;
    room.roundCount += 1;
    room.lastWordId = word.id;
    room.phase = "round";
    room.guesses = [];
    room.aiHistory = [];
    room.lastResult = null;

    const round: RoundRuntime = {
      state: {
        roundId: nanoid(),
        roundNumber: room.roundCount,
        drawerPlayerId: drawer.id,
        bucketIndex: 0,
        startedAt,
        endsAt: startedAt + this.roundDurationSeconds * 1_000,
        status: "active"
      },
      word,
      strokeStore: new StrokeStore(),
      guessBuckets: new Map(),
      aiInFlight: false,
      completedBuckets: new Set()
    };

    room.currentRound = round;
    room.lastActivityAt = Date.now();
    return round;
  }

  endRound(room: RoomRuntime, result: RoundResult): void {
    if (room.currentRound) {
      room.currentRound.state.status = "ended";
      this.wordBank.recordResult(room.currentRound.word.id, result.winner);
    }

    room.lastResult = result;
    room.phase = room.players.length >= MIN_PLAYERS ? "intermission" : "paused";

    if (result.winner === "humans") {
      room.score = {
        ...room.score,
        humans: room.score.humans + 1
      };
    }

    if (result.winner === "ai") {
      room.score = {
        ...room.score,
        ai: room.score.ai + 1
      };
    }

    room.currentRound = null;
    room.lastActivityAt = Date.now();
  }

  pauseRoom(room: RoomRuntime): void {
    room.phase = "paused";
    room.currentRound = null;
    room.guesses = [];
    room.aiHistory = [];
    room.lastActivityAt = Date.now();
  }
}
