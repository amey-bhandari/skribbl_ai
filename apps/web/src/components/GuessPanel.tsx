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
  viewerRole: "drawer" | "guesser";
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
  viewerRole,
  disabled = false,
  onSubmit
}: GuessPanelProps) {
  const [value, setValue] = useState("");
  const visibleGuesses = guesses.filter((guess) => !guess.isCorrect);
  const isDrawerView = viewerRole === "drawer";

  return (
    <section className="panel chat-panel">
      <div className="panel-head">
        <h3>Guesses</h3>
        <span>{visibleGuesses.length}</span>
      </div>
      {!isDrawerView ? (
        <>
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
        </>
      ) : (
        <p className="cooldown drawer-feed-note">Drawer view only.</p>
      )}
      {visibleGuesses.length === 0 ? <p className="muted empty-state">No guesses yet.</p> : null}
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
