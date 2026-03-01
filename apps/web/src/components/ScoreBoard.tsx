import type { GameMode, ScoreState } from "@skribbl-ai/shared";

type ScoreBoardProps = {
  score: ScoreState;
  gameMode: GameMode;
};

export function ScoreBoard({ score, gameMode }: ScoreBoardProps) {
  const humansLabel = gameMode === "humans_vs_humans" ? "Players" : "Humans";

  return (
    <section className="panel scoreboard">
      <div className="score-card humans">
        <p className="eyebrow">{humansLabel}</p>
        <strong>{score.humans}</strong>
      </div>
      <div className="score-card ai">
        <p className="eyebrow">AI</p>
        <strong>{score.ai}</strong>
      </div>
    </section>
  );
}
