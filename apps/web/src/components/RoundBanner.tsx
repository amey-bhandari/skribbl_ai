import type { AiDifficulty } from "@skribbl-ai/shared";

type RoundBannerProps = {
  roomCode: string;
  secondsRemaining: number;
  isDrawer: boolean;
  prompt: string | null;
  phase: "lobby" | "round" | "intermission" | "paused";
  aiDifficulty: AiDifficulty;
};

export function RoundBanner({ roomCode, secondsRemaining, isDrawer, prompt, phase, aiDifficulty }: RoundBannerProps) {
  const title = phase === "round" ? "Outdraw the AI" : phase === "intermission" ? "Bucket resolved" : "Chaos lobby";
  const copy =
    isDrawer && prompt
      ? `Prompt: ${prompt}. Humans and the AI both lock guesses every 5 seconds, so draw with intent.`
      : phase === "round"
        ? "Humans get one guess every 5 seconds. The AI only shows its top guess, but it still checks five labels under the hood."
        : "Private room only. Thirty-second rounds, five-second guess beats, one machine trying to read your sketch.";
  const difficultyCopy =
    aiDifficulty === "hard" ? "Hard AI · focused 86-label model" : "Easy AI · wide 345-label model";

  return (
    <section className="hero-banner">
      <div className="room-sticker">Room {roomCode}</div>
      <div>
        <p className="eyebrow">Doodle Dash</p>
        <h1>{title}</h1>
        <p className="hero-copy">{copy}</p>
        <div className="hero-chips">
          <span className="badge-chip accent">30s sprint</span>
          <span className="badge-chip">5s guess beat</span>
          <span className="badge-chip danger">AI top guess live</span>
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
