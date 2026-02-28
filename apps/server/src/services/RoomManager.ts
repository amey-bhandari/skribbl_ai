import {
  MAX_PLAYERS,
  ROOM_CODE_LENGTH,
  type PlayerState,
  type RoomState,
  type ScoreState
} from "@skribbl-ai/shared";
import { logger } from "../logger.js";
import type { PlayerRuntime, RoomRuntime } from "../game/types.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly socketToRoom = new Map<string, string>();

  createRoom(name: string, socketId: string): RoomRuntime {
    if (this.socketToRoom.has(socketId)) {
      throw new Error("You are already in a room");
    }

    const roomCode = this.generateRoomCode();
    const hostPlayer = this.createPlayer(socketId, name, true);
    const room: RoomRuntime = {
      roomCode,
      hostPlayerId: hostPlayer.id,
      players: [hostPlayer],
      score: this.createInitialScore(),
      phase: "lobby",
      currentRound: null,
      guesses: [],
      aiHistory: [],
      lastResult: null,
      drawerCursor: -1,
      roundCount: 0,
      lastWordId: null,
      lastActivityAt: Date.now(),
      intermissionTimer: null
    };

    this.rooms.set(roomCode, room);
    this.socketToRoom.set(socketId, roomCode);
    logger.info("room created", { roomCode, hostPlayerId: hostPlayer.id });
    return room;
  }

  joinRoom(roomCode: string, name: string, socketId: string): RoomRuntime {
    if (this.socketToRoom.has(socketId)) {
      throw new Error("You are already in a room");
    }

    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);
    if (!room) {
      throw new Error("Room not found");
    }

    if (room.players.length >= MAX_PLAYERS) {
      throw new Error("Room is full");
    }

    const player = this.createPlayer(socketId, name, false);
    room.players.push(player);
    room.lastActivityAt = Date.now();
    this.socketToRoom.set(socketId, room.roomCode);
    this.syncHostFlags(room);
    logger.info("room joined", { roomCode: room.roomCode, playerId: player.id });
    return room;
  }

  getRoom(roomCode: string): RoomRuntime | undefined {
    return this.rooms.get(roomCode);
  }

  getRoomBySocket(socketId: string): RoomRuntime | undefined {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) {
      return undefined;
    }

    return this.rooms.get(roomCode);
  }

  getPlayer(room: RoomRuntime, playerId: string): PlayerRuntime | undefined {
    return room.players.find((player) => player.id === playerId);
  }

  touchRoom(room: RoomRuntime): void {
    room.lastActivityAt = Date.now();
  }

  resetScore(room: RoomRuntime): void {
    room.score = this.createInitialScore();
    this.touchRoom(room);
  }

  removePlayer(socketId: string): {
    room: RoomRuntime | null;
    removedPlayerId: string | null;
    wasDrawer: boolean;
    roomDeleted: boolean;
  } {
    const roomCode = this.socketToRoom.get(socketId);
    if (!roomCode) {
      return {
        room: null,
        removedPlayerId: null,
        wasDrawer: false,
        roomDeleted: false
      };
    }

    const room = this.rooms.get(roomCode);
    this.socketToRoom.delete(socketId);

    if (!room) {
      return {
        room: null,
        removedPlayerId: null,
        wasDrawer: false,
        roomDeleted: false
      };
    }

    const playerIndex = room.players.findIndex((player) => player.id === socketId);
    if (playerIndex === -1) {
      return {
        room,
        removedPlayerId: null,
        wasDrawer: false,
        roomDeleted: false
      };
    }

    const [removedPlayer] = room.players.splice(playerIndex, 1);
    if (playerIndex <= room.drawerCursor) {
      room.drawerCursor -= 1;
    }

    const wasDrawer = room.currentRound?.state.drawerPlayerId === removedPlayer!.id;

    if (room.players.length === 0) {
      this.clearIntermission(room);
      this.rooms.delete(roomCode);
      logger.info("room deleted", { roomCode });
      return {
        room: null,
        removedPlayerId: removedPlayer!.id,
        wasDrawer,
        roomDeleted: true
      };
    }

    if (room.hostPlayerId === removedPlayer!.id) {
      room.hostPlayerId = room.players[0]!.id;
    }

    this.syncHostFlags(room);
    this.touchRoom(room);

    logger.info("player removed", { roomCode, playerId: removedPlayer!.id, wasDrawer });
    return {
      room,
      removedPlayerId: removedPlayer!.id,
      wasDrawer,
      roomDeleted: false
    };
  }

  setIntermissionTimer(room: RoomRuntime, timer: NodeJS.Timeout | null): void {
    this.clearIntermission(room);
    room.intermissionTimer = timer;
  }

  clearIntermission(room: RoomRuntime): void {
    if (room.intermissionTimer) {
      clearTimeout(room.intermissionTimer);
      room.intermissionTimer = null;
    }
  }

  cleanupIdleRooms(maxIdleMs: number): string[] {
    const now = Date.now();
    const removed: string[] = [];

    for (const [roomCode, room] of this.rooms.entries()) {
      if (now - room.lastActivityAt <= maxIdleMs) {
        continue;
      }

      this.clearIntermission(room);
      this.rooms.delete(roomCode);
      for (const player of room.players) {
        this.socketToRoom.delete(player.socketId);
      }
      removed.push(roomCode);
      logger.warn("room expired", { roomCode });
    }

    return removed;
  }

  projectRoomState(room: RoomRuntime): RoomState {
    return {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      players: room.players.map((player) => this.projectPlayer(player)),
      score: { ...room.score },
      phase: room.phase,
      currentRound: room.currentRound ? { ...room.currentRound.state } : null,
      guesses: room.guesses.map((guess) => ({ ...guess })),
      aiHistory: room.aiHistory.map((batch) => ({
        ...batch,
        labels: batch.labels.map((label) => ({ ...label }))
      })),
      strokes: room.currentRound?.strokeStore.getStrokes() ?? [],
      lastResult: room.lastResult
        ? {
            ...room.lastResult,
            winningAiLabel: room.lastResult.winningAiLabel ? { ...room.lastResult.winningAiLabel } : undefined
          }
        : null
    };
  }

  private projectPlayer(player: PlayerRuntime): PlayerState {
    return {
      id: player.id,
      name: player.name,
      isHost: player.isHost,
      joinedAt: player.joinedAt,
      connected: player.connected
    };
  }

  private syncHostFlags(room: RoomRuntime): void {
    room.players = room.players.map((player) => ({
      ...player,
      isHost: player.id === room.hostPlayerId,
      connected: true
    }));
  }

  private createPlayer(socketId: string, name: string, isHost: boolean): PlayerRuntime {
    return {
      id: socketId,
      socketId,
      name: name.trim(),
      isHost,
      joinedAt: Date.now(),
      connected: true,
      lastStrokeEventAt: 0
    };
  }

  private createInitialScore(): ScoreState {
    return {
      humans: 0,
      ai: 0
    };
  }

  private generateRoomCode(): string {
    let candidate = "";
    do {
      candidate = Array.from({ length: ROOM_CODE_LENGTH }, () => {
        const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
        return ROOM_CODE_ALPHABET[index];
      }).join("");
    } while (this.rooms.has(candidate));

    return candidate;
  }
}
