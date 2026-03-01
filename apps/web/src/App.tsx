import { useEffect, useReducer, useRef, useState } from "react";
import {
  CANVAS_SIZE,
  GUESS_INTERVAL_SECONDS,
  INTERMISSION_SECONDS,
  ROUND_DURATION_SECONDS,
  type AiDifficulty,
  type GameConfig,
  type GameMode,
  type RoomState,
  type ServerToClientEvent,
  type StrokeRecord
} from "@skribbl-ai/shared";
import { socket } from "./lib/socket";
import { AiGuessPanel } from "./components/AiGuessPanel";
import { AudioDock } from "./components/AudioDock";
import { BrushSizePicker } from "./components/BrushSizePicker";
import { CanvasBoard } from "./components/CanvasBoard";
import { ColorPalette } from "./components/ColorPalette";
import { GuessPanel } from "./components/GuessPanel";
import { PlayerRoster } from "./components/PlayerRoster";
import { RoundBanner } from "./components/RoundBanner";
import { audioEngine } from "./lib/audioEngine";

type ClientState = {
  connection: "connecting" | "connected" | "disconnected";
  playerId: string;
  room: RoomState | null;
  config: GameConfig;
  timer: {
    secondsRemaining: number;
    bucketIndex: number;
  };
  prompt: string | null;
  error: string | null;
  intermissionEndsAt: number | null;
};

type ClientAction =
  | { type: "connected"; playerId: string }
  | { type: "disconnected" }
  | { type: "leave_room" }
  | { type: "config"; config: GameConfig }
  | { type: "room"; room: RoomState }
  | { type: "timer"; secondsRemaining: number; bucketIndex: number }
  | { type: "prompt"; prompt: string }
  | { type: "error"; message: string }
  | { type: "stroke"; stroke: StrokeRecord }
  | { type: "intermission"; endsAt: number };

type EmojiBurst = {
  id: string;
  emoji: string;
  x: number;
  y: number;
  rotation: number;
  delay: number;
  size: number;
};

const initialConfig: GameConfig = {
  roundDurationSeconds: ROUND_DURATION_SECONDS,
  guessIntervalSeconds: GUESS_INTERVAL_SECONDS,
  intermissionSeconds: INTERMISSION_SECONDS,
  minPlayers: 2,
  maxPlayers: 8,
  canvasSize: CANVAS_SIZE,
  visionMinConfidence: 0.7,
  maxVisionLabels: 5
};

const initialState: ClientState = {
  connection: "connecting",
  playerId: "",
  room: null,
  config: initialConfig,
  timer: {
    secondsRemaining: ROUND_DURATION_SECONDS,
    bucketIndex: 0
  },
  prompt: null,
  error: null,
  intermissionEndsAt: null
};

const AI_DIFFICULTY_OPTIONS: Record<
  AiDifficulty,
  {
    label: string;
    summary: string;
    detail: string;
  }
> = {
  easy: {
    label: "Easy AI",
    summary: "AI can guess from the full 345-label Quick, Draw! set.",
    detail: "A wider label set makes the AI less precise."
  },
  hard: {
    label: "Hard AI",
    summary: "AI guesses from the tighter game label set.",
    detail: "A smaller label set makes the AI sharper."
  }
};

const GAME_MODE_OPTIONS: Record<
  GameMode,
  {
    label: string;
    summary: string;
    detail: string;
  }
> = {
  humans_vs_humans: {
    label: "Humans vs Humans",
    summary: "Each human is playing for their own point.",
    detail: "If the AI guesses first, the round is gone."
  },
  humans_vs_ai: {
    label: "Humans vs AI",
    summary: "All humans are on the same side against the AI.",
    detail: "Any human can save the round for the team."
  }
};

function reducer(state: ClientState, action: ClientAction): ClientState {
  switch (action.type) {
    case "connected":
      return {
        ...state,
        connection: "connected",
        playerId: action.playerId
      };
    case "disconnected":
      return {
        ...state,
        connection: "disconnected"
      };
    case "leave_room":
      return {
        ...state,
        connection: "disconnected",
        playerId: "",
        room: null,
        timer: {
          secondsRemaining: state.config.roundDurationSeconds,
          bucketIndex: 0
        },
        prompt: null,
        error: null,
        intermissionEndsAt: null
      };
    case "config":
      return {
        ...state,
        config: action.config
      };
    case "room": {
      const prompt =
        action.room.phase === "round" && action.room.currentRound?.drawerPlayerId === state.playerId ? state.prompt : null;

      return {
        ...state,
        room: action.room,
        prompt,
        intermissionEndsAt:
          action.room.phase === "intermission"
            ? state.intermissionEndsAt ?? Date.now() + state.config.intermissionSeconds * 1_000
            : null
      };
    }
    case "timer":
      return {
        ...state,
        timer: {
          secondsRemaining: action.secondsRemaining,
          bucketIndex: action.bucketIndex
        }
      };
    case "prompt":
      return {
        ...state,
        prompt: action.prompt
      };
    case "error":
      return {
        ...state,
        error: action.message
      };
    case "stroke":
      if (!state.room) {
        return state;
      }

      return {
        ...state,
        room: {
          ...state.room,
          strokes: upsertStroke(state.room.strokes, action.stroke)
        }
      };
    case "intermission":
      return {
        ...state,
        intermissionEndsAt: action.endsAt,
        prompt: null
      };
    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [playerName, setPlayerName] = useState(() => window.localStorage.getItem("skribbl-ai:name") ?? "");
  const [joinCode, setJoinCode] = useState("");
  const [brushColor, setBrushColor] = useState("#122620");
  const [brushSize, setBrushSize] = useState(8);
  const [now, setNow] = useState(Date.now());
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [musicEnabled, setMusicEnabled] = useState(() => audioEngine.getMusicEnabled());
  const [sfxEnabled, setSfxEnabled] = useState(() => audioEngine.getSfxEnabled());
  const [emojiBursts, setEmojiBursts] = useState<EmojiBurst[]>([]);
  const previousRoomCodeRef = useRef<string | null>(null);
  const previousGuessCountRef = useRef(0);
  const previousAiCountRef = useRef(0);
  const previousPhaseRef = useRef<string | null>(null);
  const previousResultKeyRef = useRef<string | null>(null);
  const room = state.room;

  useEffect(() => {
    window.localStorage.setItem("skribbl-ai:name", playerName);
  }, [playerName]);

  useEffect(() => {
    const unlockAudio = () => {
      void audioEngine.unlock();
    };

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const spawnEmojiBursts = (
    emojis: readonly string[],
    options: {
      xRange: [number, number];
      yRange: [number, number];
    }
  ) => {
    const nextBursts = emojis.map((emoji, index) => ({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      emoji,
      x: randomBetween(options.xRange[0], options.xRange[1]),
      y: randomBetween(options.yRange[0], options.yRange[1]),
      rotation: randomBetween(-18, 18),
      delay: index * 45,
      size: randomBetween(1.4, 2.6)
    }));

    setEmojiBursts((current) => [...current, ...nextBursts]);

    window.setTimeout(() => {
      const nextIds = new Set(nextBursts.map((burst) => burst.id));
      setEmojiBursts((current) => current.filter((burst) => !nextIds.has(burst.id)));
    }, 1_800);
  };

  useEffect(() => {
    if (!room) {
      previousRoomCodeRef.current = null;
      previousGuessCountRef.current = 0;
      previousAiCountRef.current = 0;
      previousPhaseRef.current = null;
      previousResultKeyRef.current = null;
      return;
    }

    if (previousRoomCodeRef.current !== room.roomCode) {
      previousRoomCodeRef.current = room.roomCode;
      previousGuessCountRef.current = room.guesses.length;
      previousAiCountRef.current = room.aiHistory.length;
      previousPhaseRef.current = room.phase;
      previousResultKeyRef.current = room.lastResult
        ? `${room.lastResult.reason}-${room.lastResult.answer}-${room.lastResult.winningPlayerId ?? "none"}`
        : null;
      return;
    }

    if (room.phase === "round" && previousPhaseRef.current !== "round") {
      audioEngine.play("round_start");
      spawnEmojiBursts(["🚀", "✏️", "✨"], { xRange: [34, 66], yRange: [18, 30] });
    }

    if (room.guesses.length > previousGuessCountRef.current) {
      audioEngine.play("guess");
      spawnEmojiBursts(["💭", "✍️", "🫧"], { xRange: [60, 86], yRange: [46, 66] });
    }

    if (room.aiHistory.length > previousAiCountRef.current) {
      audioEngine.play("ai_guess");
      spawnEmojiBursts(["🤖", "⚡", "🌀"], { xRange: [64, 88], yRange: [58, 82] });
    }

    const nextResultKey = room.lastResult
      ? `${room.lastResult.reason}-${room.lastResult.answer}-${room.lastResult.winningPlayerId ?? "none"}`
      : null;
    if (nextResultKey && nextResultKey !== previousResultKeyRef.current) {
      if (room.lastResult?.winner === "humans") {
        audioEngine.play("humans_win");
        spawnEmojiBursts(["🎉", "🧠", "✨", "🏁"], { xRange: [32, 70], yRange: [24, 48] });
      } else if (room.lastResult?.winner === "ai") {
        audioEngine.play("ai_win");
        spawnEmojiBursts(["🤖", "💥", "⚠️", "🫠"], { xRange: [36, 76], yRange: [24, 48] });
      }
    }

    previousGuessCountRef.current = room.guesses.length;
    previousAiCountRef.current = room.aiHistory.length;
    previousPhaseRef.current = room.phase;
    previousResultKeyRef.current = nextResultKey;
  }, [room]);

  useEffect(() => {
    const handleConnect = () => {
      dispatch({ type: "connected", playerId: socket.id ?? "" });
    };

    const handleDisconnect = () => {
      dispatch({ type: "disconnected" });
    };

    const handleServerEvent = (event: ServerToClientEvent) => {
      switch (event.type) {
        case "config":
          dispatch({ type: "config", config: event.config });
          break;
        case "room:state":
          dispatch({ type: "room", room: event.room });
          break;
        case "round:timer":
          dispatch({ type: "timer", secondsRemaining: event.secondsRemaining, bucketIndex: event.bucketIndex });
          break;
        case "round:prompt":
          dispatch({ type: "prompt", prompt: event.prompt });
          break;
        case "room:error":
          dispatch({ type: "error", message: event.message });
          break;
        case "canvas:stroke_broadcast":
          dispatch({ type: "stroke", stroke: event.stroke });
          break;
        case "round:ended":
          dispatch({
            type: "intermission",
            endsAt: Date.now() + state.config.intermissionSeconds * 1_000
          });
          break;
        case "game:paused":
          dispatch({ type: "error", message: event.reason });
          break;
        default:
          break;
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("server:event", handleServerEvent);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("server:event", handleServerEvent);
      socket.disconnect();
    };
  }, [state.config.intermissionSeconds]);

  const isInRoom = Boolean(room);
  const isHost = room?.hostPlayerId === state.playerId;
  const isDrawer = room?.currentRound?.drawerPlayerId === state.playerId;
  const isGameView = Boolean(room && room.phase !== "lobby" && room.phase !== "paused");
  const hasSubmitted = Boolean(
    room?.guesses.some((guess) => guess.playerId === state.playerId && guess.bucketIndex === state.timer.bucketIndex)
  );
  const canGuess = Boolean(room && room.phase === "round" && !isDrawer && !hasSubmitted);
  const canDraw = Boolean(room && room.phase === "round" && isDrawer);
  const intermissionCountdown = state.intermissionEndsAt
    ? Math.max(0, Math.ceil((state.intermissionEndsAt - now) / 1_000))
    : state.config.intermissionSeconds;
  const winningPlayerName = room?.lastResult?.winningPlayerId
    ? room.players.find((player) => player.id === room.lastResult?.winningPlayerId)?.name ?? null
    : null;

  const createRoom = () => {
    audioEngine.play("ui");
    socket.emit("client:event", {
      type: "room:create",
      name: playerName.trim()
    });
  };

  const joinRoom = () => {
    audioEngine.play("ui");
    socket.emit("client:event", {
      type: "room:join",
      roomCode: joinCode.trim().toUpperCase(),
      name: playerName.trim()
    });
  };

  const submitGuess = (text: string) => {
    socket.emit("client:event", {
      type: "guess:submit",
      text,
      bucketIndex: state.timer.bucketIndex
    });
  };

  const copyRoomCode = async (): Promise<void> => {
    if (!room) {
      return;
    }

    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopyStatus("copied");
      audioEngine.play("copy");
    } catch {
      setCopyStatus("failed");
      audioEngine.play("ui");
    }

    window.setTimeout(() => {
      setCopyStatus("idle");
    }, 2_000);
  };

  const leaveToHome = (): void => {
    audioEngine.play("ui");
    socket.disconnect();
    dispatch({ type: "leave_room" });
    setJoinCode("");
    setCopyStatus("idle");
    window.setTimeout(() => {
      socket.connect();
    }, 0);
  };

  const toggleMusic = (): void => {
    setMusicEnabled(audioEngine.setMusicEnabled(!musicEnabled));
    audioEngine.play("ui");
  };

  const toggleSfx = (): void => {
    const nextValue = !sfxEnabled;
    setSfxEnabled(audioEngine.setSfxEnabled(nextValue));
    if (nextValue) {
      audioEngine.play("ui");
    }
  };

  if (!isInRoom || !room) {
    return (
      <main className="app-shell">
        <div className="paper-grid" />
        <div className="ambient ambient-a" />
        <div className="ambient ambient-b" />
        <div className="doodle-mark doodle-mark-a">///</div>
        <div className="doodle-mark doodle-mark-b">*</div>
        <div className="doodle-mark doodle-mark-c">?</div>
        <div className="emoji-burst-layer" aria-hidden="true">
          {emojiBursts.map((burst) => (
            <span
              key={burst.id}
              className="emoji-burst"
              style={{
                left: `${burst.x}%`,
                top: `${burst.y}%`,
                transform: `rotate(${burst.rotation}deg)`,
                animationDelay: `${burst.delay}ms`,
                fontSize: `${burst.size}rem`
              }}
            >
              {burst.emoji}
            </span>
          ))}
        </div>
        <AudioDock
          musicEnabled={musicEnabled}
          sfxEnabled={sfxEnabled}
          onToggleMusic={toggleMusic}
          onToggleSfx={toggleSfx}
        />
        <section className="landing">
          <div className="landing-copy">
            <img className="landing-logo" src="/logo.png" alt="Skribbl-AI logo" />
            <h1 className="mb-2 max-w-[10ch] font-display text-[clamp(7rem,14vw,11rem)] leading-[0.86] tracking-[-0.04em] not-italic [text-shadow:3px_3px_0_rgba(41,208,223,0.75),7px_7px_0_rgba(17,17,17,0.12)]">
              Skribbl-AI
            </h1>
            <p className="hero-tagline">Draw for humans. Hide from the machine.</p>
          </div>
          <div className="landing-card">
            <label>
              <span>Name</span>
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} maxLength={24} />
            </label>
            <div className="landing-actions">
              <button
                type="button"
                className="primary-button"
                disabled={playerName.trim().length < 2 || state.connection !== "connected"}
                onClick={createRoom}
              >
                Create room
              </button>
            </div>
            <label>
              <span>Join code</span>
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                maxLength={8}
              />
            </label>
            <button
              type="button"
              className="secondary-button"
              disabled={playerName.trim().length < 2 || joinCode.trim().length < 4 || state.connection !== "connected"}
              onClick={joinRoom}
            >
              Join room
            </button>
            <p className="muted">Connection: {state.connection}</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${isGameView ? "app-shell-game" : ""}`}>
      <div className="paper-grid" />
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="doodle-mark doodle-mark-a">///</div>
      <div className="doodle-mark doodle-mark-b">*</div>
      <div className="doodle-mark doodle-mark-c">?</div>
      <div className="emoji-burst-layer" aria-hidden="true">
        {emojiBursts.map((burst) => (
          <span
            key={burst.id}
            className="emoji-burst"
            style={{
              left: `${burst.x}%`,
              top: `${burst.y}%`,
              transform: `rotate(${burst.rotation}deg)`,
              animationDelay: `${burst.delay}ms`,
              fontSize: `${burst.size}rem`
            }}
          >
            {burst.emoji}
          </span>
        ))}
      </div>
      <AudioDock
        musicEnabled={musicEnabled}
        sfxEnabled={sfxEnabled}
        onToggleMusic={toggleMusic}
        onToggleSfx={toggleSfx}
      />
      <section className={`room-layout ${isGameView ? "room-layout-game" : ""}`}>
          <div className="top-actions">
            <button type="button" className="secondary-button home-button" onClick={leaveToHome}>
              Back to home
            </button>
          </div>
          <RoundBanner
            roomCode={room.roomCode}
            secondsRemaining={room.phase === "round" ? state.timer.secondsRemaining : intermissionCountdown}
            phase={room.phase}
            gameMode={room.gameMode}
            copyStatus={copyStatus}
            onCopyRoomCode={room.phase === "lobby" || room.phase === "paused" ? () => void copyRoomCode() : undefined}
            onStartGame={
              room.phase === "lobby" || room.phase === "paused"
                ? () => {
                    audioEngine.play("ui");
                    socket.emit("client:event", { type: "room:start" });
                  }
                : undefined
            }
            canStartGame={Boolean(isHost)}
          />
          {state.error ? <p className="error-banner">{state.error}</p> : null}

          {room.phase === "lobby" || room.phase === "paused" ? (
            <section className="lobby-grid">
              <div className="panel lobby-panel">
                <section className="mode-panel">
                  <div className="panel-head">
                    <div>
                      <h3>Game mode</h3>
                    </div>
                  </div>
                  <div className="mode-grid">
                    {(Object.entries(GAME_MODE_OPTIONS) as Array<[GameMode, (typeof GAME_MODE_OPTIONS)[GameMode]]>).map(
                      ([gameMode, option]) => (
                        <button
                          key={gameMode}
                          type="button"
                          className={`mode-option ${room.gameMode === gameMode ? "is-active" : ""}`}
                          disabled={!isHost}
                          onClick={() => {
                            audioEngine.play("ui");
                            socket.emit("client:event", {
                              type: "room:set_game_mode",
                              gameMode
                            });
                          }}
                        >
                          <strong>{option.label}</strong>
                          <span>{option.summary}</span>
                          <small>{option.detail}</small>
                        </button>
                      )
                    )}
                  </div>
                </section>
                <section className="difficulty-panel">
                  <div className="panel-head">
                    <div>
                      <h3>AI difficulty</h3>
                    </div>
                  </div>
                  <div className="difficulty-grid">
                    {(Object.entries(AI_DIFFICULTY_OPTIONS) as Array<
                      [AiDifficulty, (typeof AI_DIFFICULTY_OPTIONS)[AiDifficulty]]
                    >).map(([difficulty, option]) => (
                      <button
                        key={difficulty}
                        type="button"
                        className={`difficulty-option ${room.aiDifficulty === difficulty ? "is-active" : ""}`}
                        disabled={!isHost}
                        onClick={() => {
                          audioEngine.play("ui");
                          socket.emit("client:event", {
                            type: "room:set_ai_difficulty",
                            difficulty
                          });
                        }}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.summary}</span>
                        <small>{option.detail}</small>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
              <PlayerRoster players={room.players} gameMode={room.gameMode} />
            </section>
          ) : (
            <section className={`game-grid ${isDrawer ? "game-grid-drawer" : "game-grid-guesser"}`}>
              <div className="canvas-column">
                {isDrawer && state.prompt ? (
                  <section className="prompt-banner" aria-label="Current drawing prompt">
                    <p className="eyebrow">Draw This</p>
                    <strong>{state.prompt}</strong>
                  </section>
                ) : (
                  <section className="prompt-banner prompt-banner-guessers" aria-label="Guessing status">
                    <p className="eyebrow">Guess</p>
                    <strong>Guess the word</strong>
                  </section>
                )}
                <div className={`canvas-workbench ${isDrawer ? "canvas-workbench-drawer" : "canvas-workbench-guesser"}`}>
                  <CanvasBoard
                    strokes={room.strokes}
                    canDraw={Boolean(canDraw)}
                    color={brushColor}
                    width={brushSize}
                    size={state.config.canvasSize}
                    onStrokeStart={(point) =>
                      socket.emit("client:event", { type: "canvas:stroke_start", ...point, color: brushColor, width: brushSize })
                    }
                    onStrokePoint={(point) => socket.emit("client:event", { type: "canvas:stroke_point", ...point })}
                    onStrokeEnd={() => socket.emit("client:event", { type: "canvas:stroke_end" })}
                  />
                  {isDrawer ? (
                    <div className="tool-tray">
                      <ColorPalette
                        value={brushColor}
                        onChange={setBrushColor}
                        onClear={() => socket.emit("client:event", { type: "canvas:clear" })}
                        disabled={!canDraw}
                        layout="row"
                      />
                      <BrushSizePicker value={brushSize} onChange={setBrushSize} disabled={!canDraw} layout="row" />
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="sidebar-column">
                <PlayerRoster
                  players={room.players}
                  gameMode={room.gameMode}
                  drawerPlayerId={room.currentRound?.drawerPlayerId}
                />
                <GuessPanel
                  guesses={room.guesses}
                  canGuess={canGuess}
                  hasSubmitted={hasSubmitted}
                  bucketIndex={state.timer.bucketIndex}
                  secondsRemaining={state.timer.secondsRemaining}
                  guessIntervalSeconds={state.config.guessIntervalSeconds}
                  roundDurationSeconds={state.config.roundDurationSeconds}
                  viewerRole={isDrawer ? "drawer" : "guesser"}
                  disabled={Boolean(isDrawer) || room.phase !== "round"}
                  onSubmit={submitGuess}
                />
                <AiGuessPanel batches={room.aiHistory} />
              </div>
            </section>
          )}

          {room.phase === "intermission" && room.lastResult ? (
            <section className="result-overlay">
              <div className="result-card">
                <p className="eyebrow">Round result</p>
                <h2>{room.lastResult.winner === "humans" ? "Humans win the round" : room.lastResult.winner === "ai" ? "AI wins the round" : "Round aborted"}</h2>
                <p>
                  Answer: <strong>{room.lastResult.answer}</strong>
                </p>
                <p>
                  {room.lastResult.reason === "human_guess"
                    ? room.gameMode === "humans_vs_humans"
                      ? `${winningPlayerName ?? "A player"} beat the AI to the answer${room.lastResult.correctHumanGuessCount > 1 ? `, even with ${room.lastResult.correctHumanGuessCount - 1} other correct guess${room.lastResult.correctHumanGuessCount - 1 === 1 ? "" : "es"} in the same beat` : ""}.`
                      : `${room.lastResult.correctHumanGuessCount} human${room.lastResult.correctHumanGuessCount === 1 ? "" : "s"} locked in the right guess in that 5-second window${winningPlayerName ? `, with ${winningPlayerName} landing first` : ""}.`
                    : room.lastResult.reason === "ai_guess"
                      ? `The AI matched the prompt with ${room.lastResult.winningAiLabel?.label ?? "its top guess"}. No humans solved it first.`
                      : room.lastResult.reason === "timeout"
                        ? "The 30-second round expired before any human locked in the word."
                        : "The drawer disconnected, so the round is being reset."}
                </p>
                <p className="muted">Next round in {intermissionCountdown}s</p>
              </div>
            </section>
          ) : null}
      </section>
    </main>
  );
}

function upsertStroke(strokes: StrokeRecord[], next: StrokeRecord): StrokeRecord[] {
  const existingIndex = strokes.findIndex((stroke) => stroke.id === next.id);
  if (existingIndex === -1) {
    return [...strokes, next];
  }

  return strokes.map((stroke) => (stroke.id === next.id ? next : stroke));
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + (Math.random() * (maximum - minimum));
}
