import { describe, expect, it } from "vitest";
import { parseVisionLabels } from "../services/GoogleVisionProvider.js";
import { RoomManager } from "../services/RoomManager.js";
import { RoundManager } from "../services/RoundManager.js";
import { WordBankService } from "../services/WordBankService.js";

describe("room and round flow", () => {
  it("creates a room, rotates the drawer, and tracks intermission scoring", () => {
    const rooms = new RoomManager();
    const roundManager = new RoundManager(new WordBankService(), {
      roundDurationSeconds: 30,
      guessIntervalSeconds: 15,
      intermissionSeconds: 5
    });

    const room = rooms.createRoom("Host", "socket-host");
    rooms.joinRoom(room.roomCode, "Guest", "socket-guest");

    const firstRound = roundManager.startNextRound(room);
    expect(firstRound.state.drawerPlayerId).toBe("socket-host");
    expect(room.phase).toBe("round");

    roundManager.endRound(room, {
      winner: "humans",
      reason: "human_guess",
      answer: firstRound.word.answer,
      correctHumanGuessCount: 1,
      winningPlayerId: "socket-guest"
    });

    expect(room.score.humans).toBe(1);
    expect(room.phase).toBe("intermission");

    const secondRound = roundManager.startNextRound(room);
    expect(secondRound.state.drawerPlayerId).toBe("socket-guest");
  });

  it("awards the winning player in humans-vs-humans mode", () => {
    const rooms = new RoomManager();
    const roundManager = new RoundManager(new WordBankService(), {
      roundDurationSeconds: 30,
      guessIntervalSeconds: 5,
      intermissionSeconds: 5
    });

    const room = rooms.createRoom("Host", "socket-host");
    rooms.joinRoom(room.roomCode, "Guest", "socket-guest");
    rooms.setGameMode(room, "humans_vs_humans");

    const round = roundManager.startNextRound(room);
    roundManager.endRound(room, {
      winner: "humans",
      reason: "human_guess",
      answer: round.word.answer,
      correctHumanGuessCount: 1,
      winningPlayerId: "socket-guest"
    });

    expect(room.score.humans).toBe(1);
    expect(room.score.ai).toBe(0);
    expect(room.players.find((player) => player.id === "socket-guest")?.score).toBe(1);
    expect(room.players.find((player) => player.id === "socket-host")?.score).toBe(0);
  });

  it("reassigns host when the current host disconnects", () => {
    const rooms = new RoomManager();
    const room = rooms.createRoom("Host", "socket-host");
    rooms.joinRoom(room.roomCode, "Guest", "socket-guest");

    const removal = rooms.removePlayer("socket-host");
    expect(removal.roomDeleted).toBe(false);
    expect(removal.room?.hostPlayerId).toBe("socket-guest");
    expect(removal.room?.players).toHaveLength(1);
  });

  it("normalizes vision labels from the REST response shape", () => {
    const labels = parseVisionLabels(
      [
        { description: "Alarm Clocks", score: 0.83 },
        { description: "  Desk ", score: 0.22 },
        {}
      ],
      5
    );

    expect(labels).toEqual([
      {
        label: "Alarm Clocks",
        confidence: 0.83,
        normalized: "alarm clock"
      },
      {
        label: "Desk",
        confidence: 0.22,
        normalized: "desk"
      }
    ]);
  });
});
