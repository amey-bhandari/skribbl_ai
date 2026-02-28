type GuessCooldownProps = {
  canGuess: boolean;
  hasSubmitted: boolean;
  bucketIndex: number;
  secondsRemaining: number;
  guessIntervalSeconds: number;
  roundDurationSeconds: number;
};

export function GuessCooldown({
  canGuess,
  hasSubmitted,
  bucketIndex,
  secondsRemaining,
  guessIntervalSeconds,
  roundDurationSeconds
}: GuessCooldownProps) {
  if (canGuess) {
    return <p className="cooldown cooldown-open">Window open. One guess for this 5-second beat.</p>;
  }

  if (!hasSubmitted) {
    return <p className="cooldown">Guessing is locked until the round starts.</p>;
  }

  const elapsed = roundDurationSeconds - secondsRemaining;
  const nextBoundary = (bucketIndex + 1) * guessIntervalSeconds;
  const untilNext = Math.max(0, nextBoundary - elapsed);

  return <p className="cooldown">Guess locked. Next 5-second window in {untilNext}s.</p>;
}
