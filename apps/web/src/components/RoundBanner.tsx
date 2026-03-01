import type { AiDifficulty, GameMode } from "@skribbl-ai/shared";

type RoundBannerProps = {
  roomCode: string;
  secondsRemaining: number;
  isDrawer: boolean;
  phase: "lobby" | "round" | "intermission" | "paused";
  gameMode: GameMode;
  aiDifficulty: AiDifficulty;
  copyStatus?: "idle" | "copied" | "failed";
  onCopyRoomCode?: () => void;
};

export function RoundBanner({
  roomCode,
  secondsRemaining,
  isDrawer,
  phase,
  gameMode,
  aiDifficulty,
  copyStatus = "idle",
  onCopyRoomCode
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
  const difficultyCopy =
    aiDifficulty === "hard" ? "Hard AI - focused 86-label model" : "Easy AI - wide 345-label model";
  const modeCopy =
    gameMode === "humans_vs_humans" ? "Mode - Humans vs Humans" : "Mode - Humans vs AI";

  return (
    <section className="hero-banner">
      {!isLobby ? <div className="room-sticker">Room {roomCode}</div> : null}
      <div>
        <p className="eyebrow">{isLobby ? "Room code" : "Skribbl-AI"}</p>
        <div className="banner-title-row">
          <h1>{title}</h1>
          {isLobby && onCopyRoomCode ? (
            <button type="button" className="secondary-button banner-copy-button" onClick={onCopyRoomCode}>
              {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy code"}
            </button>
          ) : null}
        </div>
        {!isGamePhase ? (
          <div className="hero-chips">
            <span className="badge-chip accent">30s sprint</span>
            <span className="badge-chip">5s guess beat</span>
            <span className="badge-chip danger">AI top guess live</span>
            <span className="badge-chip">{modeCopy}</span>
            <span className={`badge-chip ${aiDifficulty === "hard" ? "danger" : "accent"}`}>{difficultyCopy}</span>
          </div>
        ) : null}
      </div>
      <div className="timer-stack">
        <div className="timer-pill">
          <span>Time</span>
          <strong>{secondsRemaining}s</strong>
        </div>
        {!isGamePhase ? <p className="timer-note">{isDrawer ? "Draw weird, not vague." : "Read the drawing, not the machine."}</p> : null}
      </div>
    </section>
  );
}
