import type { AiGuessBatch } from "@skribbl-ai/shared";

type AiGuessPanelProps = {
  batches: AiGuessBatch[];
};

export function AiGuessPanel({ batches }: AiGuessPanelProps) {
  return (
    <section className="panel ai-panel">
      <div className="panel-head">
        <div>
          <h3>AI Monitor</h3>
          <p className="panel-note">Only the top guess is public. The full top 5 stays in server logs.</p>
        </div>
        <span>top 1 every 5s</span>
      </div>
      {batches.length === 0 ? <p className="muted">The AI has not guessed yet.</p> : null}
      <div className="ai-list">
        {batches
          .slice()
          .reverse()
          .map((batch) => (
            <article key={`${batch.bucketIndex}-${batch.createdAt}`} className="ai-batch">
              <header>
                <strong>Beat {batch.bucketIndex + 1}</strong>
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
