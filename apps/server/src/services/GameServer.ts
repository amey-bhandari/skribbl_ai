import type { Server as HttpServer } from "node:http";
import {
  MAX_STROKE_EVENTS_PER_SECOND,
  MIN_PLAYERS,
  buildAnswerSet,
  clientEventSchema,
  type AiGuessBatch,
  type ClientToServerEvent,
  type GuessFeedEntry,
  type RoundResult,
  type ServerToClientEvent,
  type StrokeRecord,
  type VisionLabel,
  type WordEntry
} from "@skribbl-ai/shared";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import { appConfig, publicConfig } from "../config.js";
import type { RoomRuntime } from "../game/types.js";
import { logger } from "../logger.js";
import { CanvasRenderer } from "./CanvasRenderer.js";
import { GuessEvaluator } from "./GuessEvaluator.js";
import { RoomManager } from "./RoomManager.js";
import { RoundManager } from "./RoundManager.js";
import { TimerEngine } from "./TimerEngine.js";
import type { AiProvider } from "./AiProvider.js";
import { WordBankService } from "./WordBankService.js";

const CLIENT_EVENT_NAME = "client:event";
const SERVER_EVENT_NAME = "server:event";

export class GameServer {
  readonly io: Server;

  private readonly roomManager = new RoomManager();
  private readonly wordBank = new WordBankService();
  private readonly roundManager = new RoundManager(this.wordBank, {
    roundDurationSeconds: appConfig.ROUND_DURATION_SECONDS,
    guessIntervalSeconds: appConfig.GUESS_INTERVAL_SECONDS,
    intermissionSeconds: appConfig.INTERMISSION_SECONDS
  });
  private readonly timerEngine = new TimerEngine();
  private readonly guessEvaluator = new GuessEvaluator();
  private readonly canvasRenderer = new CanvasRenderer(appConfig.CANVAS_SIZE);

  constructor(server: HttpServer, private readonly aiProvider: AiProvider) {
    this.io = new Server(server, {
      cors: {
        origin: appConfig.CORS_ORIGINS.length === 0 ? true : appConfig.CORS_ORIGINS,
        credentials: true
      }
    });
  }

  register(): void {
    this.io.on("connection", (socket) => {
      this.sendEvent(socket, {
        type: "config",
        config: publicConfig
      });

      socket.on(CLIENT_EVENT_NAME, (rawEvent: unknown) => {
        void this.handleClientEvent(socket, rawEvent);
      });

      socket.on("disconnect", () => {
        void this.handleDisconnect(socket);
      });
    });
  }

  cleanupIdleRooms(): void {
    const removed = this.roomManager.cleanupIdleRooms(appConfig.ROOM_IDLE_TTL_MINUTES * 60_000);
    for (const roomCode of removed) {
      this.timerEngine.stopRound(roomCode);
      this.io.to(roomCode).emit(SERVER_EVENT_NAME, {
        type: "room:error",
        message: "Room expired after inactivity"
      } satisfies ServerToClientEvent);
      this.io.in(roomCode).disconnectSockets();
    }
  }

  private async handleClientEvent(socket: Socket, rawEvent: unknown): Promise<void> {
    const parsed = clientEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      this.sendError(socket, "Invalid event payload");
      return;
    }

    const event = parsed.data as ClientToServerEvent;

    switch (event.type) {
      case "room:create":
        this.handleRoomCreate(socket, event.name);
        break;
      case "room:join":
        this.handleRoomJoin(socket, event.roomCode, event.name);
        break;
      case "room:start":
        this.handleRoomStart(socket);
        break;
      case "room:set_ai_difficulty":
        this.handleAiDifficultyChange(socket, event.difficulty);
        break;
      case "room:set_game_mode":
        this.handleGameModeChange(socket, event.gameMode);
        break;
      case "canvas:stroke_start":
        this.handleStrokeStart(socket, event);
        break;
      case "canvas:stroke_point":
        this.handleStrokePoint(socket, event);
        break;
      case "canvas:stroke_end":
        this.handleStrokeEnd(socket);
        break;
      case "guess:submit":
        this.handleGuessSubmit(socket, event.text, event.bucketIndex);
        break;
      case "room:reset_score":
        this.handleScoreReset(socket);
        break;
      default:
        this.sendError(socket, "Unsupported event");
    }
  }

  private handleRoomCreate(socket: Socket, name: string): void {
    try {
      const room = this.roomManager.createRoom(name, socket.id);
      socket.join(room.roomCode);
      this.broadcastRoomState(room);
    } catch (error) {
      this.sendError(socket, getErrorMessage(error));
    }
  }

  private handleRoomJoin(socket: Socket, roomCode: string, name: string): void {
    try {
      const room = this.roomManager.joinRoom(roomCode, name, socket.id);
      socket.join(room.roomCode);
      this.broadcastRoomState(room);
      if (room.currentRound) {
        this.sendTimerUpdate(room);
      }
    } catch (error) {
      this.sendError(socket, getErrorMessage(error));
    }
  }

  private handleRoomStart(socket: Socket): void {
    const room = this.requireRoom(socket.id);
    if (!room) {
      return;
    }

    if (room.hostPlayerId !== socket.id) {
      this.sendError(socket, "Only the host can start the game");
      return;
    }

    if (!this.roundManager.canStart(room)) {
      this.sendError(socket, "At least two players are required to start");
      return;
    }

    this.startRound(room);
  }

  private handleScoreReset(socket: Socket): void {
    const room = this.requireRoom(socket.id);
    if (!room) {
      return;
    }

    if (room.hostPlayerId !== socket.id) {
      this.sendError(socket, "Only the host can reset the score");
      return;
    }

    this.roomManager.resetScore(room);
    this.broadcastRoomState(room);
  }

  private handleAiDifficultyChange(socket: Socket, difficulty: "easy" | "hard"): void {
    const room = this.requireRoom(socket.id);
    if (!room) {
      return;
    }

    if (room.hostPlayerId !== socket.id) {
      this.sendError(socket, "Only the host can change AI difficulty");
      return;
    }

    if (room.phase === "round") {
      this.sendError(socket, "Change AI difficulty between rounds");
      return;
    }

    this.roomManager.setAiDifficulty(room, difficulty);
    this.broadcastRoomState(room);
  }

  private handleGameModeChange(socket: Socket, gameMode: "humans_vs_humans" | "humans_vs_ai"): void {
    const room = this.requireRoom(socket.id);
    if (!room) {
      return;
    }

    if (room.hostPlayerId !== socket.id) {
      this.sendError(socket, "Only the host can change game mode");
      return;
    }

    if (room.phase === "round") {
      this.sendError(socket, "Change game mode between rounds");
      return;
    }

    this.roomManager.setGameMode(room, gameMode);
    this.roomManager.resetScore(room);
    this.broadcastRoomState(room);
  }

  private handleStrokeStart(
    socket: Socket,
    event: Extract<ClientToServerEvent, { type: "canvas:stroke_start" }>
  ): void {
    const room = this.requireActiveRound(socket.id);
    if (!room || !room.currentRound) {
      return;
    }

    if (room.currentRound.state.drawerPlayerId !== socket.id) {
      this.sendError(socket, "Only the drawer can draw");
      return;
    }

    const stroke = room.currentRound.strokeStore.startStroke(
      socket.id,
      event.color,
      event.width,
      { x: event.x, y: event.y }
    );

    this.roomManager.touchRoom(room);
    this.broadcastStroke(room.roomCode, stroke);
  }

  private handleStrokePoint(
    socket: Socket,
    event: Extract<ClientToServerEvent, { type: "canvas:stroke_point" }>
  ): void {
    const room = this.requireActiveRound(socket.id);
    if (!room || !room.currentRound) {
      return;
    }

    if (room.currentRound.state.drawerPlayerId !== socket.id) {
      this.sendError(socket, "Only the drawer can draw");
      return;
    }

    const player = this.roomManager.getPlayer(room, socket.id);
    if (!player) {
      return;
    }

    const now = Date.now();
    const minIntervalMs = 1_000 / MAX_STROKE_EVENTS_PER_SECOND;
    if (now - player.lastStrokeEventAt < minIntervalMs) {
      return;
    }

    player.lastStrokeEventAt = now;
    const stroke = room.currentRound.strokeStore.appendPoint({ x: event.x, y: event.y });
    if (!stroke) {
      return;
    }

    this.roomManager.touchRoom(room);
    this.broadcastStroke(room.roomCode, stroke);
  }

  private handleStrokeEnd(socket: Socket): void {
    const room = this.requireActiveRound(socket.id);
    if (!room || !room.currentRound) {
      return;
    }

    if (room.currentRound.state.drawerPlayerId !== socket.id) {
      this.sendError(socket, "Only the drawer can draw");
      return;
    }

    const stroke = room.currentRound.strokeStore.endStroke();
    if (!stroke) {
      return;
    }

    this.roomManager.touchRoom(room);
    this.broadcastStroke(room.roomCode, stroke);
  }

  private handleGuessSubmit(socket: Socket, text: string, bucketIndex: number): void {
    const room = this.requireActiveRound(socket.id);
    if (!room || !room.currentRound) {
      return;
    }

    if (room.currentRound.state.drawerPlayerId === socket.id) {
      this.sendError(socket, "The drawer cannot submit guesses");
      return;
    }

    const currentBucketIndex = this.getCurrentBucketIndex(room);
    if (bucketIndex !== currentBucketIndex) {
      this.sendEvent(socket, {
        type: "guess:rejected",
        reason: `Guesses are currently open for bucket ${currentBucketIndex}`
      });
      return;
    }

    const existingGuessers = room.currentRound.guessBuckets.get(bucketIndex) ?? new Set<string>();
    if (existingGuessers.has(socket.id)) {
      this.sendEvent(socket, {
        type: "guess:rejected",
        reason: "You have already guessed in this interval"
      });
      return;
    }

    existingGuessers.add(socket.id);
    room.currentRound.guessBuckets.set(bucketIndex, existingGuessers);

    const player = this.roomManager.getPlayer(room, socket.id);
    if (!player) {
      return;
    }

    const evaluated = this.guessEvaluator.evaluateGuess(text, room.currentRound.word);
    const guess: GuessFeedEntry = {
      id: `${socket.id}:${Date.now()}`,
      playerId: socket.id,
      playerName: player.name,
      text,
      normalized: evaluated.normalized,
      bucketIndex,
      createdAt: Date.now(),
      isCorrect: evaluated.isCorrect
    };

    room.guesses = [...room.guesses.slice(-39), guess];
    this.roomManager.touchRoom(room);
    this.emitToRoom(room.roomCode, {
      type: "guess:accepted",
      guess
    });
    this.broadcastRoomState(room);
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    const removal = this.roomManager.removePlayer(socket.id);
    if (!removal.room) {
      return;
    }

    const room = removal.room;

    if (room.players.length < MIN_PLAYERS) {
      this.timerEngine.stopRound(room.roomCode);
      this.roomManager.clearIntermission(room);
      this.roundManager.pauseRoom(room);
      this.emitToRoom(room.roomCode, {
        type: "game:paused",
        reason: "Waiting for at least two players"
      });
      this.broadcastRoomState(room);
      return;
    }

    if (removal.wasDrawer) {
      this.timerEngine.stopRound(room.roomCode);
      const result: RoundResult = {
        winner: "none",
        reason: "drawer_disconnect",
        answer: room.lastResult?.answer ?? room.currentRound?.word.answer ?? "",
        correctHumanGuessCount: 0
      };
      this.finishRound(room, result);
      return;
    }

    this.broadcastRoomState(room);
  }

  private startRound(room: RoomRuntime): void {
    this.roomManager.clearIntermission(room);

    const round = this.roundManager.startNextRound(room);
    this.broadcastRoomState(room);
    this.emitToRoom(room.roomCode, {
      type: "game:started",
      round: round.state
    });
    this.sendEvent(round.state.drawerPlayerId, {
      type: "round:prompt",
      roundId: round.state.roundId,
      prompt: round.word.answer
    });
    this.sendTimerUpdate(room);

    logger.info("round started", {
      roomCode: room.roomCode,
      roundId: round.state.roundId,
      answer: round.word.answer
    });

    this.timerEngine.startRound(
      room.roomCode,
      round.state.startedAt,
      this.roundManager.roundDurationSeconds,
      this.roundManager.guessIntervalSeconds,
      {
        onTick: async (secondsRemaining, bucketIndex) => {
          const activeRoom = this.roomManager.getRoom(room.roomCode);
          if (!activeRoom || !activeRoom.currentRound) {
            return;
          }

          activeRoom.currentRound.state.bucketIndex = bucketIndex;
          this.emitToRoom(activeRoom.roomCode, {
            type: "round:timer",
            secondsRemaining,
            bucketIndex
          });
        },
        onCheckpoint: async (evaluatedBucketIndex) => {
          await this.runAiCheckpoint(room.roomCode, evaluatedBucketIndex);
        },
        onTimeout: async () => {
          const activeRoom = this.roomManager.getRoom(room.roomCode);
          if (!activeRoom || !activeRoom.currentRound) {
            return;
          }

          const finalBucketIndex = Math.floor(
            (this.roundManager.roundDurationSeconds - 1) / this.roundManager.guessIntervalSeconds
          );
          const humanResult = this.resolveHumanBucket(activeRoom, finalBucketIndex);
          if (humanResult) {
            this.finishRound(activeRoom, humanResult);
            return;
          }

          const result: RoundResult = {
            winner: "ai",
            reason: "timeout",
            answer: activeRoom.currentRound.word.answer,
            correctHumanGuessCount: 0
          };
          this.finishRound(activeRoom, result);
        }
      }
    );
  }

  private async runAiCheckpoint(roomCode: string, bucketIndex: number): Promise<void> {
    const room = this.roomManager.getRoom(roomCode);
    if (!room || !room.currentRound) {
      return;
    }

    const round = room.currentRound;
    if (round.completedBuckets.has(bucketIndex) || round.state.status !== "active") {
      return;
    }

    round.completedBuckets.add(bucketIndex);
    this.roomManager.touchRoom(room);

    const humanResult = this.resolveHumanBucket(room, bucketIndex);
    if (humanResult) {
      this.finishRound(room, humanResult);
      return;
    }

    if (!round.strokeStore.hasInk()) {
      this.emitToRoom(room.roomCode, {
        type: "ai:skipped",
        bucketIndex,
        reason: "Canvas is still blank"
      });
      return;
    }

    if (round.aiInFlight) {
      this.emitToRoom(room.roomCode, {
        type: "ai:skipped",
        bucketIndex,
        reason: "Previous AI request still running"
      });
      return;
    }

    if (!this.aiProvider.configured) {
      this.emitToRoom(room.roomCode, {
        type: "ai:skipped",
        bucketIndex,
        reason: "AI provider is not configured"
      });
      return;
    }

    round.aiInFlight = true;
    const strokes = round.strokeStore.getStrokes();
    const imageBuffer = this.canvasRenderer.render(strokes);
    const startedAt = Date.now();

    try {
      const rawLabels = await this.aiProvider.detectLabels({
        imageBuffer,
        strokes,
        candidates: this.wordBank.getWords(),
        aiDifficulty: room.aiDifficulty
      });
      const activeRoom = this.roomManager.getRoom(roomCode);
      if (!activeRoom || !activeRoom.currentRound || activeRoom.currentRound.state.roundId !== round.state.roundId) {
        return;
      }

      const labels = this.getPublicAiLabels(rawLabels, activeRoom);
      const resolvedMatch =
        this.aiProvider.name === "local_doodle"
          ? this.matchPublicTopGuess(labels, activeRoom.currentRound.word)
          : this.guessEvaluator.matchVisionLabels(labels, activeRoom.currentRound.word, appConfig.VISION_MIN_CONFIDENCE);

      const batch: AiGuessBatch = {
        bucketIndex,
        labels,
        createdAt: Date.now(),
        matched: Boolean(resolvedMatch)
      };

      activeRoom.aiHistory = [...activeRoom.aiHistory, batch];
      this.emitToRoom(activeRoom.roomCode, {
        type: "ai:labels",
        batch
      });
      this.broadcastRoomState(activeRoom);

      logger.info("ai labels received", {
        roomCode,
        bucketIndex,
        provider: this.aiProvider.name,
        difficulty: room.aiDifficulty,
        latencyMs: Date.now() - startedAt,
        rawTopLabels: rawLabels.map((label) => `${label.label}:${label.confidence.toFixed(3)}`).join(", "),
        publicTopLabels: labels.map((label) => `${label.label}:${label.confidence.toFixed(3)}`).join(", ")
      });

      if (resolvedMatch) {
        const result: RoundResult = {
          winner: "ai",
          reason: "ai_guess",
          answer: activeRoom.currentRound.word.answer,
          correctHumanGuessCount: 0,
          winningAiLabel: resolvedMatch
        };
        this.finishRound(activeRoom, result);
      }
    } catch (error) {
      logger.warn("ai checkpoint failed", {
        roomCode,
        bucketIndex,
        provider: this.aiProvider.name,
        error: getErrorMessage(error)
      });
      this.emitToRoom(room.roomCode, {
        type: "ai:skipped",
        bucketIndex,
        reason: getErrorMessage(error)
      });
    } finally {
      const activeRoom = this.roomManager.getRoom(roomCode);
      if (activeRoom?.currentRound?.state.roundId === round.state.roundId) {
        activeRoom.currentRound.aiInFlight = false;
      }
    }
  }

  private finishRound(room: RoomRuntime, result: RoundResult): void {
    this.timerEngine.stopRound(room.roomCode);
    this.roomManager.clearIntermission(room);
    this.roundManager.endRound(room, result);

    logger.info("round ended", {
      roomCode: room.roomCode,
      winner: result.winner,
      reason: result.reason,
      answer: result.answer
    });

    this.emitToRoom(room.roomCode, {
      type: "round:ended",
      result
    });
    this.broadcastRoomState(room);

    if (room.players.length >= MIN_PLAYERS) {
      const timer = setTimeout(() => {
        const activeRoom = this.roomManager.getRoom(room.roomCode);
        if (!activeRoom) {
          return;
        }

        if (activeRoom.players.length < MIN_PLAYERS) {
          this.roundManager.pauseRoom(activeRoom);
          this.emitToRoom(activeRoom.roomCode, {
            type: "game:paused",
            reason: "Waiting for at least two players"
          });
          this.broadcastRoomState(activeRoom);
          return;
        }

        this.startRound(activeRoom);
      }, this.roundManager.intermissionSeconds * 1_000);

      this.roomManager.setIntermissionTimer(room, timer);
    }
  }

  private resolveHumanBucket(room: RoomRuntime, bucketIndex: number): RoundResult | null {
    if (!room.currentRound) {
      return null;
    }

    const correctGuesses = room.guesses
      .filter((guess) => guess.bucketIndex === bucketIndex && guess.isCorrect)
      .sort((left, right) => left.createdAt - right.createdAt);

    if (correctGuesses.length === 0) {
      return null;
    }

    return {
      winner: "humans",
      reason: "human_guess",
      answer: room.currentRound.word.answer,
      correctHumanGuessCount: correctGuesses.length,
      winningPlayerId: correctGuesses[0]!.playerId
    };
  }

  private matchPublicTopGuess(labels: VisionLabel[], word: WordEntry): VisionLabel | undefined {
    const topLabel = labels[0];
    if (!topLabel) {
      return undefined;
    }

    const answers = buildAnswerSet(word);
    return answers.has(topLabel.normalized) ? topLabel : undefined;
  }

  private getPublicAiLabels(labels: VisionLabel[], room: RoomRuntime): VisionLabel[] {
    if (labels.length <= 1) {
      return labels;
    }

    const previousTopGuess = room.aiHistory.at(-1)?.labels[0]?.normalized;
    if (!previousTopGuess) {
      return labels;
    }

    const nextIndex = labels.findIndex((label) => label.normalized !== previousTopGuess);
    if (nextIndex <= 0) {
      return labels;
    }

    const nextLabels = [...labels];
    const [nextTop] = nextLabels.splice(nextIndex, 1);
    if (!nextTop) {
      return labels;
    }

    nextLabels.unshift(nextTop);
    return nextLabels;
  }

  private requireRoom(socketId: string): RoomRuntime | null {
    return this.roomManager.getRoomBySocket(socketId) ?? null;
  }

  private requireActiveRound(socketId: string): RoomRuntime | null {
    const room = this.requireRoom(socketId);
    if (!room || !room.currentRound || room.phase !== "round") {
      return null;
    }

    return room;
  }

  private getCurrentBucketIndex(room: RoomRuntime): number {
    if (!room.currentRound) {
      return 0;
    }

    const elapsedSeconds = Math.floor((Date.now() - room.currentRound.state.startedAt) / 1_000);
    return Math.min(
      Math.floor((this.roundManager.roundDurationSeconds - 1) / this.roundManager.guessIntervalSeconds),
      Math.max(0, Math.floor(elapsedSeconds / this.roundManager.guessIntervalSeconds))
    );
  }

  private broadcastRoomState(room: RoomRuntime): void {
    this.emitToRoom(room.roomCode, {
      type: "room:state",
      room: this.roomManager.projectRoomState(room)
    });
  }

  private sendTimerUpdate(room: RoomRuntime): void {
    if (!room.currentRound) {
      return;
    }

    const secondsRemaining = Math.max(0, Math.ceil((room.currentRound.state.endsAt - Date.now()) / 1_000));
    this.emitToRoom(room.roomCode, {
      type: "round:timer",
      secondsRemaining,
      bucketIndex: this.getCurrentBucketIndex(room)
    });
  }

  private broadcastStroke(roomCode: string, stroke: StrokeRecord): void {
    this.emitToRoom(roomCode, {
      type: "canvas:stroke_broadcast",
      stroke
    });
  }

  private sendError(socket: Socket, message: string): void {
    this.sendEvent(socket, {
      type: "room:error",
      message
    });
  }

  private emitToRoom(roomCode: string, event: ServerToClientEvent): void {
    this.io.to(roomCode).emit(SERVER_EVENT_NAME, event);
  }

  private sendEvent(target: Socket | string, event: ServerToClientEvent): void {
    if (typeof target === "string") {
      this.io.to(target).emit(SERVER_EVENT_NAME, event);
      return;
    }

    target.emit(SERVER_EVENT_NAME, event);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown server error";
}
