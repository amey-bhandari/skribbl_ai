import { useState } from "react";
import type { GuessFeedEntry } from "@skribbl-ai/shared";
import { GuessCooldown } from "./GuessCooldown";

type GuessPanelProps = {
  guesses: GuessFeedEntry[];
  canGuess: boolean;
  hasSubmitted: boolean;
  bucketIndex: number;
  secondsRemaining: number;
  guessIntervalSeconds: number;
  roundDurationSeconds: number;
  disabled?: boolean;
  onSubmit: (value: string) => void;
};

export function GuessPanel({
  guesses,
  canGuess,
  hasSubmitted,
  bucketIndex,
  secondsRemaining,
  guessIntervalSeconds,
  roundDurationSeconds,
  disabled = false,
  onSubmit
}: GuessPanelProps) {
  const [value, setValue] = useState("");
  const visibleGuesses = guesses.filter((guess) => !guess.isCorrect);

  return (
    <section className="panel chat-panel">
      <div className="panel-head">
        <div>
          <h3>Human Guesses</h3>
          <p className="panel-note">Wrong guesses stay visible. Correct ones stay hidden until the bucket resolves.</p>
        </div>
        <span>{visibleGuesses.length} shown</span>
      </div>
      <form
        className="guess-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canGuess || disabled || value.trim().length === 0) {
            return;
          }

          onSubmit(value.trim());
          setValue("");
        }}
      >
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Drop one guess for this beat"
          disabled={disabled}
          maxLength={64}
        />
        <button type="submit" disabled={!canGuess || disabled || value.trim().length === 0}>
          Send
        </button>
      </form>
      <GuessCooldown
        canGuess={canGuess}
        hasSubmitted={hasSubmitted}
        bucketIndex={bucketIndex}
        secondsRemaining={secondsRemaining}
        guessIntervalSeconds={guessIntervalSeconds}
        roundDurationSeconds={roundDurationSeconds}
      />
      {visibleGuesses.length === 0 ? <p className="muted empty-state">No public guesses yet.</p> : null}
      <ul className="guess-feed">
        {visibleGuesses
          .slice()
          .reverse()
          .map((guess) => (
            <li key={guess.id}>
              <div className="guess-meta">
                <strong>{guess.playerName}</strong>
                <span>Beat {guess.bucketIndex + 1}</span>
              </div>
              <p>{guess.text}</p>
            </li>
          ))}
      </ul>
    </section>
  );
}
