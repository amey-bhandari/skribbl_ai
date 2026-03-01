import type { AiGuessBatch } from "@skribbl-ai/shared";

type AiGuessPanelProps = {
  batches: AiGuessBatch[];
};

export function AiGuessPanel({ batches }: AiGuessPanelProps) {
  return (
    <section className="panel ai-panel">
      <div className="panel-head">
        <h3>AI guesses</h3>
        <span>{batches.length}</span>
      </div>
      {batches.length === 0 ? <p className="muted">No AI guesses yet.</p> : null}
      <div className="ai-list">
        {batches
          .slice()
          .reverse()
          .map((batch, index) => (
            <article key={`${batch.bucketIndex}-${batch.createdAt}`} className="ai-batch">
              <header>
                <strong>{index + 1}) guess</strong>
                {batch.matched ? <span className="badge-chip danger">Matched</span> : null}
              </header>
              {batch.labels[0] ? (
                <div className="ai-top-line">
                  <span>{batch.labels[0].label}</span>
                  <span>{Math.round(batch.labels[0].confidence * 100)}%</span>
                </div>
              ) : (
                <p className="muted">No guess returned.</p>
              )}
            </article>
          ))}
      </div>
    </section>
  );
}
