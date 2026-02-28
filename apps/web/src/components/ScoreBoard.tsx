import type { ScoreState } from "@skribbl-ai/shared";

type ScoreBoardProps = {
  score: ScoreState;
};

export function ScoreBoard({ score }: ScoreBoardProps) {
  return (
    <section className="panel scoreboard">
      <div className="score-card humans">
        <p className="eyebrow">Humans</p>
        <strong>{score.humans}</strong>
        <span>people-first reads</span>
      </div>
      <div className="score-card ai">
        <p className="eyebrow">AI</p>
        <strong>{score.ai}</strong>
        <span>machine steals</span>
      </div>
    </section>
  );
}
