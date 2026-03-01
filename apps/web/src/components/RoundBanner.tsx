import type { AiDifficulty, GameMode } from "@skribbl-ai/shared";

type RoundBannerProps = {
  roomCode: string;
  secondsRemaining: number;
  isDrawer: boolean;
  prompt: string | null;
  phase: "lobby" | "round" | "intermission" | "paused";
  gameMode: GameMode;
  aiDifficulty: AiDifficulty;
};

export function RoundBanner({
  roomCode,
  secondsRemaining,
  isDrawer,
  prompt,
  phase,
  gameMode,
  aiDifficulty
}: RoundBannerProps) {
  const title =
    phase === "round"
      ? gameMode === "humans_vs_humans"
        ? "Beat the room"
        : "Outdraw the AI"
      : phase === "intermission"
        ? "Bucket resolved"
        : "Chaos lobby";
  const copy =
    isDrawer && prompt
      ? gameMode === "humans_vs_humans"
        ? `Prompt: ${prompt}. The first human to lock it in before the AI gets the point, so every beat matters.`
        : `Prompt: ${prompt}. Humans and the AI both lock guesses every 5 seconds, so draw with intent.`
      : phase === "round"
        ? gameMode === "humans_vs_humans"
          ? "Players race each other every 5 seconds while the AI tries to shut the round down with its own guess."
          : "Humans get one guess every 5 seconds. The AI only shows its top guess, but it still checks five labels under the hood."
        : gameMode === "humans_vs_humans"
          ? "Competitive room. Guess before the AI and before everyone else."
          : "Private room only. Thirty-second rounds, five-second guess beats, one machine trying to read your sketch.";
  const difficultyCopy =
    aiDifficulty === "hard" ? "Hard AI - focused 86-label model" : "Easy AI - wide 345-label model";
  const modeCopy =
    gameMode === "humans_vs_humans" ? "Mode - Humans vs Humans" : "Mode - Humans vs AI";

  return (
    <section className="hero-banner">
      <div className="room-sticker">Room {roomCode}</div>
      <div>
        <p className="eyebrow">Skribbl-AI</p>
        <h1>{title}</h1>
        <p className="hero-copy">{copy}</p>
        <div className="hero-chips">
          <span className="badge-chip accent">30s sprint</span>
          <span className="badge-chip">5s guess beat</span>
          <span className="badge-chip danger">AI top guess live</span>
          <span className="badge-chip">{modeCopy}</span>
          <span className={`badge-chip ${aiDifficulty === "hard" ? "danger" : "accent"}`}>{difficultyCopy}</span>
        </div>
      </div>
      <div className="timer-stack">
        <div className="timer-pill">
          <span>Time</span>
          <strong>{secondsRemaining}s</strong>
        </div>
        <p className="timer-note">{isDrawer ? "Draw weird, not vague." : "Read the drawing, not the machine."}</p>
      </div>
    </section>
  );
}
