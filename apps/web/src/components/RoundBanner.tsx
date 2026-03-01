import type { GameMode } from "@skribbl-ai/shared";

type RoundBannerProps = {
  roomCode: string;
  secondsRemaining: number;
  phase: "lobby" | "round" | "intermission" | "paused";
  gameMode: GameMode;
  copyStatus?: "idle" | "copied" | "failed";
  onCopyRoomCode?: () => void;
  onStartGame?: () => void;
  canStartGame?: boolean;
};

export function RoundBanner({
  roomCode,
  secondsRemaining,
  phase,
  gameMode,
  copyStatus = "idle",
  onCopyRoomCode,
  onStartGame,
  canStartGame = false
}: RoundBannerProps) {
  const isLobby = phase === "lobby" || phase === "paused";
  const isGamePhase = phase === "round" || phase === "intermission";
  const title =
    phase === "round"
      ? gameMode === "humans_vs_humans"
        ? "Beat the room"
        : "Outdraw the AI"
      : phase === "intermission"
        ? "Bucket resolved"
        : roomCode;

  return (
    <section className="hero-banner">
      {!isLobby ? <div className="room-sticker">Room {roomCode}</div> : null}
      <div>
        <p className="eyebrow">{isLobby ? "Room code" : "Skribbl-AI"}</p>
        <div className="banner-title-row">
          <h1>{title}</h1>
          {isLobby ? (
            <div className="banner-actions">
              {onCopyRoomCode ? (
                <button type="button" className="secondary-button banner-copy-button" onClick={onCopyRoomCode}>
                  {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy code"}
                </button>
              ) : null}
              {onStartGame ? (
                <button type="button" className="primary-button banner-start-button" onClick={onStartGame} disabled={!canStartGame}>
                  Start game
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {!isLobby ? (
        <div className="timer-stack">
          <div className="timer-pill">
            <span>Time</span>
            <strong>{secondsRemaining}s</strong>
          </div>
        </div>
      ) : null}
    </section>
  );
}
